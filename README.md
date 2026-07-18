# slack-user-cli

A deliberately small CLI for listing Slack channels and managing your personal sidebar custom sections (called “categories” here).

Channel listing uses Slack's supported Web API. Custom sections use undocumented Slack endpoints, because Slack does not publish an official API for personal sidebar sections. Those commands can break when Slack changes its web client.

## Setup

Requires Node 20 or newer. No install step or third-party packages are needed.

```sh
export SLACK_TOKEN='your-user-or-session-token'
# Some session tokens also require the matching cookie:
export SLACK_COOKIE='your-cookie-header-value'

npm test
node src/cli.js auth test
node src/cli.js channels list
node src/cli.js categories list
```

Or authenticate directly from a browser cookie export. The workspace token is
extracted in memory and is never printed or stored:

```sh
node src/cli.js auth test --cookies /path/to/cookies.json --workspace hackclub
node src/cli.js channels list --cookies /path/to/cookies.json --workspace hackclub
```

Do not put credentials in `.env`, shell history, screenshots, commits, or chat. The CLI only reads them from the process environment and `.env` is gitignored as a backstop.

## Commands

```text
auth test                         Verify the selected Slack session
auth sessions                     List safe metadata for cookie-derived sessions
channels list                     List channels the user belongs to
categories list                   List sidebar categories and memberships
categories create NAME            Create a category
categories icon SECTION EMOJI     Change an existing category icon
categories assign SECTION IDS...  Move channels into a category
categories delete SECTION         Delete a category
emoji search QUERY                Find matching workspace emoji names
```

Use `--json` for stable structured output and `--raw` when the complete Slack
response is needed for debugging. Raw output can contain private workspace
metadata, so inspect it locally and do not commit it.

## Category changes

Every mutation is a dry run unless `--apply` is present:

```sh
node src/cli.js categories create "Projects" --emoji ':hammer_and_wrench:'
node src/cli.js categories create "Projects" --emoji ':hammer_and_wrench:' --apply
node src/cli.js categories icon SEC123 hammer_and_wrench --apply
node src/cli.js categories assign SEC123 C123 C456 --apply
node src/cli.js categories delete SEC123 --apply
```

`assign` moves the named channels into the section. Always run `categories list --json` and save the non-secret output before applying a change.

On Enterprise Grid cookie sessions, category commands automatically select the
enterprise session while channel commands use the workspace session. Use
`auth sessions` and `--session N` only when you need to override that choice.

## Hack Club organizer

`src/organize.js` and `src/reorder.js` contain the user-specific Hack Club
classification and ordering policy. They are intentionally separate from the
general CLI.

```sh
# Preview category counts; does not mutate Slack.
node src/organize.js /path/to/cookies.json

# Apply the reviewed policy.
node src/organize.js /path/to/cookies.json --apply

# Preview, then enforce the approved category order.
node src/reorder.js /path/to/cookies.json
node src/reorder.js /path/to/cookies.json --apply
```

The organizer uses channel/category metadata only. It does not read messages,
DM content, files, or Slack search history.

## Limitations

- Personal sidebar categories rely on undocumented Slack Web API methods and
  can break when Slack changes its client.
- Cookie-export authentication is session-based; revoke the Slack session after
  temporary automation and never reuse an exposed export.
- Category response counts can lag after bulk updates. Verify the unique
  `channel_ids_page.channel_ids` membership rather than trusting `count` alone.
- The Hack Club organizer is intentionally workspace-specific and should not be
  used as a generic classifier without replacing its policy.
