/**
 * Rule-based decision adapter for txpilot.
 *
 * This is the default adapter. It requires no AI provider and no external API
 * keys. Every decision is deterministic and derived purely from live network
 * data, so it runs entirely on free tiers and behaves identically on every run
 * given the same inputs.
 */

import type {
  NetworkSnapshot,
  RetryConfig,
  RetryDecision,
  TipConfig,
  TipDecision,
  FailureClassification,
} from '../types';
import { DEFAULTS } from '../constants';

/** Percentile key used to index into a {@link NetworkSnapshot.tipPercentiles}. */
type PercentileKey = 'p25' | 'p50' | 'p75' | 'p95';

/**
 * Clamps a value into the inclusive `[min, max]` range and rounds to a whole
 * number of lamports.
 */
function clampLamports(value: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(value, min), max));
}

/**
 * Decides how large a Jito tip to attach to a transaction, based purely on
 * current network conditions.
 *
 * The percentile and multiplier scale with congestion, and a small urgency
 * bonus is added when a Jito leader is imminent. The result is always clamped
 * into the configured `[minLamports, maxLamports]` guardrails.
 *
 * @param snapshot - Live network conditions, including the tip floor distribution.
 * @param config - Tip guardrails. Missing fields fall back to package defaults.
 * @returns A {@link TipDecision} with the final tip and plain-English reasoning.
 */
export function decideTip(snapshot: NetworkSnapshot, config: TipConfig): TipDecision {
  const min = config.minLamports ?? DEFAULTS.TIP_MIN_LAMPORTS;
  const max = config.maxLamports ?? DEFAULTS.TIP_MAX_LAMPORTS;

  // Choose the base percentile and congestion multiplier from the congestion level.
  let percentile: PercentileKey;
  let multiplier: number;
  switch (snapshot.congestionLevel) {
    case 'low':
      percentile = 'p25';
      multiplier = 1.0;
      break;
    case 'medium':
      percentile = 'p50';
      multiplier = 1.2;
      break;
    case 'high':
    default:
      percentile = 'p75';
      multiplier = 1.5;
      break;
  }

  const basePercentileValue = snapshot.tipPercentiles[percentile];

  // Add a 10% urgency bonus when a Jito leader is about to appear, so we do not
  // narrowly miss a landable window over a rounding-sized tip difference.
  const urgencyApplied = snapshot.isJitoLeaderWindow && snapshot.slotsUntilJitoLeader < 4;
  const urgencyMultiplier = urgencyApplied ? 1.1 : 1.0;
  const effectiveMultiplier = multiplier * urgencyMultiplier;

  const rawTip = basePercentileValue * effectiveMultiplier;
  const lamports = clampLamports(rawTip, min, max);

  const urgencyNote = urgencyApplied
    ? ` A Jito leader is ${snapshot.slotsUntilJitoLeader} slot(s) away, so a 10% urgency bonus was applied.`
    : '';

  const reasoning =
    `Congestion is ${snapshot.congestionLevel}, so the ${percentile} tip floor ` +
    `(${basePercentileValue} lamports) was multiplied by ${effectiveMultiplier.toFixed(2)}.` +
    urgencyNote +
    ` Final tip after clamping to [${min}, ${max}]: ${lamports} lamports.`;

  return {
    lamports,
    percentileUsed: percentile,
    reasoning,
    congestionMultiplier: effectiveMultiplier,
  };
}

/**
 * Decides whether and how to retry a failed transaction.
 *
 * The decision follows the recovery path chosen by the failure classifier:
 * - `abort` stops immediately.
 * - `retry_refresh_blockhash` retries with a fresh blockhash and the same tip.
 * - `retry_raise_tip` retries with the tip raised by 30%.
 * - `retry_wait` retries after exponential backoff with the same tip.
 *
 * Retries always stop once `retryCount` reaches `config.maxRetries`.
 *
 * @param failure - The classified failure driving the decision.
 * @param snapshot - Live network conditions (used to keep tips sane on raises).
 * @param retryCount - How many retries have already happened.
 * @param config - Retry guardrails. Missing fields fall back to package defaults.
 * @returns A {@link RetryDecision} with the next action and plain-English reasoning.
 */
export function decideRetry(
  failure: FailureClassification,
  snapshot: NetworkSnapshot,
  retryCount: number,
  config: RetryConfig,
): RetryDecision {
  const maxRetries = config.maxRetries ?? DEFAULTS.MAX_RETRIES;
  const baseWaitMs = config.baseWaitMs ?? DEFAULTS.BASE_WAIT_MS;
  const maxWaitMs = config.maxWaitMs ?? DEFAULTS.MAX_WAIT_MS;

  // The tip attached to the failed attempt is our baseline for any raise.
  const currentTip = snapshot.tipPercentiles.p50;

  // Hard stop 1: the classifier says this is unrecoverable.
  if (failure.recoveryPath === 'abort') {
    return {
      shouldRetry: false,
      newTipLamports: currentTip,
      waitMs: 0,
      refreshBlockhash: false,
      reasoning: `${failure.type} is not retryable. ${failure.suggestion}`,
    };
  }

  // Hard stop 2: we have exhausted the retry budget.
  if (retryCount >= maxRetries) {
    return {
      shouldRetry: false,
      newTipLamports: currentTip,
      waitMs: 0,
      refreshBlockhash: false,
      reasoning: `Retry budget exhausted after ${retryCount} attempt(s) (max ${maxRetries}). Giving up on a ${failure.type} failure.`,
    };
  }

  switch (failure.recoveryPath) {
    case 'retry_refresh_blockhash':
      return {
        shouldRetry: true,
        newTipLamports: currentTip,
        waitMs: baseWaitMs,
        refreshBlockhash: true,
        reasoning: `${failure.type}: refreshing the blockhash and retrying with the same tip after ${baseWaitMs}ms.`,
      };

    case 'retry_raise_tip': {
      const raised = clampLamports(
        currentTip * 1.3,
        DEFAULTS.TIP_MIN_LAMPORTS,
        DEFAULTS.TIP_MAX_LAMPORTS,
      );
      return {
        shouldRetry: true,
        newTipLamports: raised,
        waitMs: baseWaitMs,
        refreshBlockhash: false,
        reasoning: `${failure.type}: raising the tip by 30% (${currentTip} -> ${raised} lamports) and retrying after ${baseWaitMs}ms.`,
      };
    }

    case 'retry_wait':
    default: {
      // Exponential backoff: base * 2^retryCount, capped at maxWaitMs.
      const backoff = Math.min(baseWaitMs * 2 ** retryCount, maxWaitMs);
      return {
        shouldRetry: true,
        newTipLamports: currentTip,
        waitMs: backoff,
        refreshBlockhash: false,
        reasoning: `${failure.type}: waiting ${backoff}ms (exponential backoff, capped at ${maxWaitMs}ms) before retrying with the same tip.`,
      };
    }
  }
}
