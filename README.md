<div align="center">

# slack-user-cli

**Your Slack sidebar, minus the archaeological dig.**

List joined channels, inspect personal sidebar sections, and safely organize
categories from a tiny dependency-free CLI.

[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-4A154B)](./package.json)
[![Tests](https://img.shields.io/badge/tests-9%20passing-2ea44f)](./test/slack.test.js)
[![Private Slack API](https://img.shields.io/badge/sidebar%20API-undocumented-orange)](#important-caveat)

</div>

> [!WARNING]
> Slack does not publish an official API for personal sidebar sections. Channel
> listing uses the supported Web API; category commands use Slack's private web
> client endpoints and may need repairs after Slack updates.

## What it does

- Lists the public and private channels your account has joined.
- Lists personal sidebar categories and their channel memberships.
- Creates, icons, assigns, reorders, and deletes categories.
- Previews every mutation before it touches Slack.
- Loads browser-exported Slack cookies without persisting extracted tokens.
- Handles Enterprise Grid's separate workspace and enterprise sessions.
- Uses no runtime dependencies—just Node.js 20 or newer.

## Quick start

```sh
git clone https://github.com/some-du6e/slack-user-cli.git
cd slack-user-cli
npm link
```

Authenticate with environment variables:

```sh
export SLACK_TOKEN='your-user-or-session-token'
export SLACK_COOKIE='optional-matching-cookie-header'

slack-user auth test
slack-user channels list
slack-user categories list
```

Or use a browser cookie export. The workspace token is extracted in memory and
is never printed or written to disk:

```sh
slack-user auth test \
  --cookies /path/to/cookies.json \
  --workspace hackclub

slack-user channels list \
  --cookies /path/to/cookies.json \
  --workspace hackclub \
  --json
```

> [!CAUTION]
> Cookie exports are credentials. Keep them out of shell history, screenshots,
> chat, logs, and Git. Revoke the Slack session after temporary automation.

## Commands

| Command | What it does |
| --- | --- |
| `auth test` | Verify the selected Slack session. |
| `auth sessions` | Show safe metadata for cookie-derived sessions. |
| `channels list` | List channels the user belongs to. |
| `categories list` | List sidebar categories and memberships. |
| `categories create NAME` | Create a category. |
| `categories icon SECTION EMOJI` | Change a category icon. |
| `categories assign SECTION IDS...` | Move channels into a category. |
| `categories delete SECTION` | Delete a category. |
| `emoji search QUERY` | Find matching workspace emoji names. |

Useful options:

| Option | Meaning |
| --- | --- |
| `--cookies FILE` | Authenticate from a browser cookie-export JSON file. |
| `--workspace NAME` | Select a workspace subdomain such as `hackclub`. |
| `--session N` | Override automatic workspace/enterprise session selection. |
| `--json` | Emit stable, simplified JSON. |
| `--raw` | Emit Slack's complete response for local debugging. |
| `--apply` | Execute a mutation; without it, mutations are previews. |

## Safe category changes

Mutations are dry runs by default:

```sh
# Preview
slack-user categories create Projects \
  --emoji hammer_and_wrench \
  --channels C123,C456

# Apply the exact reviewed plan
slack-user categories create Projects \
  --emoji hammer_and_wrench \
  --channels C123,C456 \
  --apply
```

More examples:

```sh
slack-user emoji search project --json
slack-user categories icon Projects hammer_and_wrench --apply
slack-user categories assign Projects C123 C456 --apply
slack-user categories delete Projects --apply
```

`categories assign` removes requested channels from their previous custom
sections before inserting them into the destination. It also avoids duplicate
insertions when rerun.

## Enterprise Grid

Cookie exports can yield two authenticated contexts:

```text
T… workspace session   → channel commands
E… enterprise session  → personal category commands
```

The CLI selects the required context automatically and fails clearly when it is
missing. Inspect available contexts with:

```sh
slack-user auth sessions --cookies /path/to/cookies.json --workspace hackclub
```

## Hack Club organizer

The repository includes an opinionated, user-specific Hack Club classifier. It
is deliberately separate from the general CLI.

```sh
# Preview classification counts
node src/organize.js /path/to/cookies.json

# Apply the reviewed classification
node src/organize.js /path/to/cookies.json --apply

# Preview and apply sidebar ordering
node src/reorder.js /path/to/cookies.json
node src/reorder.js /path/to/cookies.json --apply
```

The organizer uses channel names, topics, purposes, IDs, and existing category
metadata. It does **not** read messages, DMs, files, search results, or history.

## Development

```sh
npm test
node --check src/cli.js
node src/cli.js --help
```

Repository map:

```text
src/cli.js        command parsing, previews, and output
src/slack.js      Slack HTTP client and private category contracts
src/session.js    cookie filtering and in-memory session bootstrap
src/organize.js   Hack Club-specific classification policy
src/reorder.js    Hack Club-specific sidebar ordering
test/             mocked API-contract tests
```

Read [AGENTS.md](./AGENTS.md) before making automated changes.

## Important caveat

- Personal category methods are undocumented and can change without notice.
- Raw API output can contain private workspace metadata; inspect it locally.
- Category `count` values can lag after bulk updates. Unique
  `channel_ids_page.channel_ids` membership is the reliable read-back signal.
- The bundled organizer is workspace-specific; replace its policy before using
  it elsewhere.

---

<div align="center">

Built for people whose Slack sidebar has become a cry for help.

</div>
