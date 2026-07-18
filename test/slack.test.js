import test from "node:test";
import assert from "node:assert/strict";
import { SlackClient, SlackError } from "../src/slack.js";

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
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: Object.fromEntries(options.body) });
    const payload = url.endsWith("users.channelSections.list")
      ? { ok: true, channel_sections: [{ channel_section_id: "SEC1", name: "Macondo", next_channel_section_id: "SEC2" }] }
      : { ok: true };
    return new Response(JSON.stringify(payload));
  };
  const client = new SlackClient({ token: "test-token", teamId: "E1", fetchImpl });
  await client.setCategoryIcon("SEC1", "macondo");
  assert.match(calls[1].url, /users\.channelSections\.set$/);
  assert.equal(calls[1].body.name, "Macondo");
  assert.equal(calls[1].body.emoji, "macondo");
  assert.equal(calls[1].body.next_channel_section_id, "SEC2");
});
