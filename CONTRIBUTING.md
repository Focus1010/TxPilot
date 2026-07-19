# Contributing to solana-smart-tx

Thanks for wanting to help. This package exists to get builders from zero to a working payment bot in one afternoon, and every contribution that moves that goal forward is welcome.

Nigerian builders are the primary audience. Contributions that improve the experience for low-bandwidth and mobile-first environments (smaller payloads, better offline handling, clearer error messages, lower default costs) are especially valued.

## Ways to contribute

- Report a bug or a confusing error message.
- Improve a plain-English failure `reason` or `suggestion`.
- Add or refine a `FailureType` pattern in the classifier.
- Implement the AI adapter (see the roadmap in the README).
- Improve the docs, especially the quick start and the Telegram pattern.
- Add a reference bot (remittance or P2P payment request).

## Getting set up

```bash
git clone https://github.com/Focus1010/solana-smart-Tx.git
cd solana-smart-Tx
npm install
cp .env.example .env   # fill in RPC_URL and WALLET_PRIVATE_KEY
npm run build          # must pass with zero errors
```

To try the examples against mainnet:

```bash
npm run example:basic
npm run example:telegram
```

## Development standards

- TypeScript strict mode stays on. The build must pass `tsc` with zero errors.
- Every exported function and class needs a JSDoc comment.
- No `any` types unless there is no alternative, and then only with a comment explaining why.
- Named exports only in `src`. Default exports are fine in `examples`.
- `send()` must never throw. Any failure path returns a `SendResult` with `landed: false` and a populated `reason` and `suggestion`.
- Keep imports clean and avoid circular dependencies.
- No em dashes in the README. Use a regular dash or rewrite the sentence.

## Commit and pull request flow

1. Fork the repo and create a branch: `git checkout -b fix/clearer-blockhash-message`.
2. Make focused commits with clear messages. One logical change per commit.
3. Run `npm run build` before you push.
4. Open a pull request against `main` with a short summary of what changed, why, and how you tested it.

Keep pull requests small and focused. A tight PR that improves one failure message is easier to review and merge than a large one that touches everything.

## Reporting bugs

Open an issue with:

- What you expected to happen.
- What actually happened, including the full `SendResult` or error text.
- The network (`mainnet-beta` or `devnet`) and whether you were in `rule-based` or `ai` mode.
- Steps to reproduce, ideally a minimal snippet.

## Code of conduct

Be kind and assume good intent. We are all here to help builders ship payments that actually land.

## License

By contributing, you agree that your contributions are licensed under the MIT License, the same license that covers this project.
