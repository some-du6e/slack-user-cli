#!/usr/bin/env node
import { SlackClient, SlackError } from "./slack.js";
import { loadSlackSessions } from "./session.js";

const HELP = `slack-user - list channels and manage personal sidebar categories

Usage:
  slack-user auth test [--cookies FILE] [--workspace NAME]
  slack-user auth sessions --cookies FILE [--workspace NAME]
  slack-user channels list [--json]
  slack-user categories list [--json]
  slack-user categories create <name> [--emoji VALUE] [--apply]
  slack-user categories icon <section-id-or-name> <emoji> [--apply]
  slack-user categories delete <section-id> [--apply]
  slack-user categories assign <section-id> <channel-id>... [--apply]
  slack-user emoji search <query> [--json]

Environment:
  SLACK_TOKEN   User/session token. Required. Never written to disk.
  SLACK_COOKIE  Optional cookie for internal category endpoints.

Options:
  --cookies FILE    Browser-exported Slack cookie JSON; token stays in memory.
  --workspace NAME  Workspace subdomain, e.g. hackclub. Used with --cookies.
  --session N       Select an authenticated session from 'auth sessions'.

Mutations preview by default. Pass --apply to execute them.
Category APIs are private Slack endpoints and may change without notice.`;

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (index === args.length - 1) throw new Error(`${name} requires a value`);
  return args.splice(index, 2)[1];
}

function printRows(rows, json) {
  if (json) return console.log(JSON.stringify(rows, null, 2));
  if (!rows.length) return console.log("No results.");
  console.table(rows);
}

function categoryArray(payload) {
  return payload.channel_sections ?? payload.custom_sections ?? payload.sections ?? [];
}

function preview(method, params) {
  console.log("DRY RUN — no Slack changes made");
  console.log(JSON.stringify({ method, params }, null, 2));
  console.log("Re-run with --apply to execute.");
}

function previewSteps(steps) {
  console.log("DRY RUN — no Slack changes made");
  console.log(JSON.stringify({ steps }, null, 2));
  console.log("Re-run with --apply to execute.");
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = [...argv];
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }
  const json = args.includes("--json");
  const raw = args.includes("--raw");
  const apply = args.includes("--apply");
  const cookieFile = takeOption(args, "--cookies");
  const workspace = takeOption(args, "--workspace");
  const sessionOption = takeOption(args, "--session");
  for (const flag of ["--json", "--raw", "--apply"]) {
    const index = args.indexOf(flag);
    if (index >= 0) args.splice(index, 1);
  }

  const [group, action, ...rest] = args;
  if (args[0] === "auth" && args[1] === "sessions") {
    if (!cookieFile) throw new Error("auth sessions requires --cookies FILE");
    const sessions = await loadSlackSessions(cookieFile, workspace);
    return printRows(sessions.map((s, index) => ({ index, team: s.auth.team, user: s.auth.user, team_id: s.auth.team_id, url: s.auth.url })), json);
  }
  let session = null;
  if (cookieFile) {
    const sessions = await loadSlackSessions(cookieFile, workspace);
    if (sessionOption !== undefined) {
      const selectedIndex = Number(sessionOption);
      session = sessions[selectedIndex];
      if (!session) throw new Error(`Session index ${selectedIndex} does not exist (found ${sessions.length})`);
    } else {
      const requiredPrefix = group === "categories" ? "E" : group === "channels" ? "T" : null;
      session = requiredPrefix
        ? sessions.find(candidate => String(candidate.auth.team_id).startsWith(requiredPrefix))
        : sessions[0];
      if (!session) throw new Error(requiredPrefix
        ? `No ${requiredPrefix}-prefixed Slack session is available for ${group} commands`
        : "No authenticated Slack session is available");
    }
  }
  const client = new SlackClient({
    token: session?.token ?? env.SLACK_TOKEN,
    cookie: session?.cookie ?? env.SLACK_COOKIE,
    teamId: session?.auth?.team_id ?? env.SLACK_TEAM_ID,
    baseUrl: env.SLACK_API_BASE_URL
  });

  if (group === "auth" && action === "test") {
    const result = await client.call("auth.test");
    printRows([{ team: result.team, user: result.user, team_id: result.team_id, user_id: result.user_id }], json);
  } else if (group === "channels" && action === "list") {
    const channels = await client.listChannels();
    if (raw) return console.log(JSON.stringify(channels, null, 2));
    printRows(channels.map(c => ({ id: c.id, name: c.name, private: Boolean(c.is_private), member: Boolean(c.is_member) })), json);
  } else if (group === "categories" && action === "list") {
    const result = await client.listCategories();
    if (raw) return console.log(JSON.stringify(result, null, 2));
    printRows(categoryArray(result).map(s => ({
      id: s.id ?? s.section_id ?? s.channel_section_id,
      name: s.name,
      emoji: s.emoji ?? "",
      channels: (s.channel_ids_page?.channel_ids ?? s.channel_ids ?? s.channels ?? s.channel_section_channels ?? []).map?.(c => typeof c === "string" ? c : c.channel_id ?? c.id).join(",") ?? ""
    })), json);
  } else if (group === "categories" && action === "create") {
    const values = [...rest];
    const emoji = takeOption(values, "--emoji") ?? "bookmark_tabs";
    const channels = (takeOption(values, "--channels") ?? "").split(",").filter(Boolean);
    const [name] = values;
    if (!name || values.length !== 1) throw new Error("create requires one quoted category name");
    if (!apply) {
      const steps = [{ method: "users.channelSections.create", params: { name, emoji } }];
      if (channels.length) steps.push({
        method: "users.channelSections.channels.bulkUpdate",
        params: { remove: [], insert: [{ channel_section_id: "$created.channel_section_id", channel_ids: channels }] }
      });
      return previewSteps(steps);
    }
    console.log(JSON.stringify(await client.createCategory(name, emoji, channels), null, 2));
  } else if (group === "categories" && action === "icon") {
    const [identifier, emoji] = rest;
    if (!identifier || !emoji || rest.length !== 2) throw new Error("icon requires <section-id-or-name> <emoji>");
    const listed = await client.listCategories();
    const sections = categoryArray(listed);
    const section = sections.find(s => s.channel_section_id === identifier)
      ?? sections.find(s => s.name.toLowerCase() === identifier.toLowerCase());
    if (!section) throw new Error(`Category not found: ${identifier}`);
    const params = { channel_section_id: section.channel_section_id, name: section.name, emoji, next_channel_section_id: section.next_channel_section_id ?? "" };
    if (!apply) return preview("users.channelSections.set", params);
    console.log(JSON.stringify(await client.setCategoryIcon(section.channel_section_id, emoji), null, 2));
  } else if (group === "categories" && action === "delete") {
    const [sectionId] = rest;
    if (!sectionId || rest.length !== 1) throw new Error("delete requires <section-id>");
    if (!apply) return preview("users.channelSections.delete", { channel_section_id: sectionId });
    console.log(JSON.stringify(await client.deleteCategory(sectionId), null, 2));
  } else if (group === "categories" && action === "assign") {
    const [identifier, ...channelIds] = rest;
    if (!identifier || !channelIds.length) throw new Error("assign requires <section-id-or-name> and at least one <channel-id>");
    const listed = await client.listCategories();
    const sections = categoryArray(listed);
    const section = sections.find(s => s.channel_section_id === identifier)
      ?? sections.find(s => s.name.toLowerCase() === identifier.toLowerCase());
    if (!section) throw new Error(`Category not found: ${identifier}`);
    const sectionId = section.channel_section_id;
    if (!apply) {
      const plan = await client.planAssignment(sectionId, channelIds);
      return preview("users.channelSections.channels.bulkUpdate", { remove: plan.remove, insert: plan.insert });
    }
    console.log(JSON.stringify(await client.assignChannels(sectionId, channelIds), null, 2));
  } else if (group === "emoji" && action === "search") {
    const [query] = rest;
    if (!query || rest.length !== 1) throw new Error("emoji search requires <query>");
    printRows((await client.searchEmoji(query)).map(name => ({ name })), json);
  } else {
    throw new Error(`Unknown command: ${args.join(" ")}\n\n${HELP}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    if (error instanceof SlackError) {
      console.error(`Slack rejected the request: ${error.message}`);
      const details = error.response?.response_metadata?.messages;
      if (Array.isArray(details)) for (const detail of details) console.error(`  ${detail}`);
      if (["invalid_auth", "not_authed"].includes(error.code)) console.error("Check SLACK_TOKEN (and SLACK_COOKIE for category commands).");
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}
