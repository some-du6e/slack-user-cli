import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SlackClient, SlackError } from "../src/slack.js";
import { loadSlackSessions } from "../src/session.js";

test("paginates channel listing", async () => {
  const calls = [];
  const pages = [
    { ok: true, channels: [{ id: "C1" }], response_metadata: { next_cursor: "next" } },
    { ok: true, channels: [{ id: "C2" }], response_metadata: { next_cursor: "" } }
  ];
  const fetchImpl = async (_url, options) => {
    calls.push(Object.fromEntries(options.body));
    return new Response(JSON.stringify(pages.shift()), { status: 200 });
  };
  const client = new SlackClient({ token: "test-token", fetchImpl });
  assert.deepEqual((await client.listChannels()).map(c => c.id), ["C1", "C2"]);
  assert.equal(calls[1].cursor, "next");
});

test("turns Slack errors into SlackError", async () => {
  const fetchImpl = async () => new Response('{"ok":false,"error":"invalid_auth"}');
  const client = new SlackClient({ token: "bad", fetchImpl });
  await assert.rejects(() => client.call("auth.test"), error => {
    assert.ok(error instanceof SlackError);
    assert.equal(error.code, "invalid_auth");
    return true;
  });
});

test("sends category assignment with Slack's bulk-update contract", async () => {
  let sent;
  const fetchImpl = async (url, options) => {
    sent = { url, body: Object.fromEntries(options.body) };
    const payload = url.endsWith("users.channelSections.list")
      ? { ok: true, channel_sections: [
          { channel_section_id: "OLD", channel_ids_page: { channel_ids: ["C1"] } },
          { channel_section_id: "SEC1", channel_ids_page: { channel_ids: [] } }
        ] }
      : { ok: true };
    return new Response(JSON.stringify(payload));
  };
  const client = new SlackClient({ token: "test-token", fetchImpl });
  await client.assignChannels("SEC1", ["C1", "C2"]);
  assert.match(sent.url, /users\.channelSections\.channels\.bulkUpdate$/);
  assert.equal(sent.body.remove, '[{"channel_section_id":"OLD","channel_ids":["C1"]}]');
  assert.equal(sent.body.insert, '[{"channel_section_id":"SEC1","channel_ids":["C1","C2"]}]');
});

test("sets an icon while preserving category name and ordering", async () => {
  const calls = [];
  let emoji = "";
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: Object.fromEntries(options.body) });
    let payload;
    if (url.endsWith("users.channelSections.list")) {
      payload = { ok: true, channel_sections: [{ channel_section_id: "SEC1", name: "Macondo", emoji, next_channel_section_id: "SEC2" }] };
    } else {
      emoji = Object.fromEntries(options.body).emoji;
      payload = { ok: true };
    }
    return new Response(JSON.stringify(payload));
  };
  const client = new SlackClient({ token: "test-token", teamId: "E1", fetchImpl });
  await client.setCategoryIcon("SEC1", "macondo");
  assert.match(calls[1].url, /users\.channelSections\.set$/);
  assert.equal(calls[1].body.name, "Macondo");
  assert.equal(calls[1].body.emoji, "macondo");
  assert.equal(calls[1].body.next_channel_section_id, "SEC2");
});

test("sets and reads back a category name", async () => {
  let name = "Old";
  const fetchImpl = async (url, options) => {
    if (url.endsWith("users.channelSections.list")) {
      return new Response(JSON.stringify({ ok: true, channel_sections: [{ channel_section_id: "SEC1", name, emoji: "package" }] }));
    }
    name = Object.fromEntries(options.body).name;
    return new Response('{"ok":true}');
  };
  const client = new SlackClient({ token: "test-token", teamId: "E1", fetchImpl });
  const result = await client.setCategory("SEC1", { name: "New" });
  assert.equal(result.category.name, "New");
});

test("creates and reads back a category", async () => {
  let created = false;
  const fetchImpl = async (url) => {
    if (url.endsWith("users.channelSections.create")) {
      created = true;
      return new Response('{"ok":true,"channel_section_id":"SEC1"}');
    }
    return new Response(JSON.stringify({
      ok: true,
      channel_sections: created ? [{ channel_section_id: "SEC1", name: "Projects", emoji: "package" }] : []
    }));
  };
  const client = new SlackClient({ token: "test-token", teamId: "E1", fetchImpl });
  const result = await client.createCategory("Projects", "package");
  assert.equal(result.category.channel_section_id, "SEC1");
});

test("deletes and confirms category absence", async () => {
  let deleted = false;
  const fetchImpl = async (url) => {
    if (url.endsWith("users.channelSections.delete")) {
      deleted = true;
      return new Response('{"ok":true}');
    }
    return new Response(JSON.stringify({
      ok: true,
      channel_sections: deleted ? [] : [{ channel_section_id: "SEC1", name: "Projects" }]
    }));
  };
  const client = new SlackClient({ token: "test-token", teamId: "E1", fetchImpl });
  assert.equal((await client.deleteCategory("SEC1")).ok, true);
});

test("removes stale source membership even when target already contains channel", async () => {
  let sent;
  const fetchImpl = async (url, options) => {
    if (url.endsWith("users.channelSections.list")) {
      return new Response(JSON.stringify({ ok: true, channel_sections: [
        { channel_section_id: "OLD", channel_ids_page: { channel_ids: ["C1"] } },
        { channel_section_id: "SEC1", channel_ids_page: { channel_ids: ["C1"] } }
      ] }));
    }
    sent = Object.fromEntries(options.body);
    return new Response('{"ok":true}');
  };
  const client = new SlackClient({ token: "test-token", fetchImpl });
  await client.assignChannels("SEC1", ["C1"]);
  assert.equal(sent.remove, '[{"channel_section_id":"OLD","channel_ids":["C1"]}]');
  assert.equal(sent.insert, "[]");
});

test("cookie bootstrap forwards only Slack-domain cookies", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "slack-user-cli-"));
  const cookieFile = path.join(directory, "cookies.json");
  await writeFile(cookieFile, JSON.stringify([
    { domain: ".slack.com", name: "d", value: "slack-secret" },
    { domain: ".example.com", name: "session", value: "unrelated-secret" }
  ]));
  const headers = [];
  const fetchImpl = async (url, options = {}) => {
    headers.push(options.headers?.cookie ?? "");
    if (url.endsWith("auth.test")) return new Response('{"ok":true,"team_id":"T1"}');
    return new Response("<html>xoxc-test-token-value</html>");
  };
  try {
    const sessions = await loadSlackSessions(cookieFile, "workspace", fetchImpl);
    assert.equal(sessions.length, 1);
    assert.ok(headers.every(header => header.includes("d=slack-secret")));
    assert.ok(headers.every(header => !header.includes("unrelated-secret")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
