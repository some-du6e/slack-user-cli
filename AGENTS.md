# Agent guide

This repository contains a dependency-free Node.js CLI for a Slack user's
personal sidebar categories. Read `README.md` before changing behavior.

## Safety boundaries

- Never commit, print, log, or paste Slack tokens, cookie values, or cookie-export contents.
- Use fake values such as `test-token` in tests and examples.
- Treat `--cookies FILE` as sensitive input. Tokens extracted from it must remain in memory.
- Do not read Slack messages, DMs, files, search results, or history. Channel names,
  topics, purposes, IDs, and category metadata are the allowed classification surface.
- Category mutations must remain dry-run by default and require `--apply`.
- Category endpoints are private Slack APIs. Verify request contracts against tests and
  a read-back before claiming success.
- Enterprise Grid has two sessions: workspace (`T…`) for channels and enterprise
  (`E…`) for sidebar categories. Preserve the automatic selection in `src/cli.js`.

## Commands

```sh
npm test
node --check src/cli.js
node src/cli.js --help
```

Live checks require a user-provided cookie export and must never echo it:

```sh
node src/cli.js auth test --cookies /path/to/cookies.json --workspace WORKSPACE
node src/cli.js channels list --cookies /path/to/cookies.json --workspace WORKSPACE --json
node src/cli.js categories list --cookies /path/to/cookies.json --workspace WORKSPACE --json
```

Run mutations first without `--apply`, inspect the preview, then apply and read the
category back. `categories assign` moves channels out of prior custom sections and
is idempotent for channels already in the destination.

## Code map

- `src/cli.js`: argument parsing, dry-run behavior, and human/JSON output.
- `src/slack.js`: Slack HTTP client and category contracts.
- `src/session.js`: cookie-export parsing and in-memory workspace-token bootstrap.
- `src/organize.js`: Hack Club-specific classification policy and bulk organization.
- `src/reorder.js`: Hack Club-specific category ordering.
- `test/slack.test.js`: mocked API-contract tests.

## Change checklist

1. Keep secrets out of diffs and output.
2. Add or update a mocked contract test.
3. Run `npm test` and `node --check` on changed entrypoints.
4. For live mutations, preview first and verify category membership afterward.
5. Confirm every target channel appears in exactly one custom category.

