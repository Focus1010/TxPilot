/**
 * txpilot - public package entry point.
 *
 * Everything a builder needs is re-exported from here, so imports stay flat:
 *
 * ```ts
 * import { SmartTx, FailureClassifier, DEFAULTS } from 'txpilot';
 * import type { SendResult, FailureType } from 'txpilot';
 * ```
 */

export { SmartTx } from './SmartTx';
export { FailureClassifier } from './classifier';
export type { ClassifierContext } from './classifier';
export * from './types';
export { DEFAULTS, FAILURE_MESSAGES, FAILURE_SUGGESTIONS } from './constants';
