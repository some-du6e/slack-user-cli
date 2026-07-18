import { SlackClient } from "./slack.js";
import { loadSlackSessions } from "./session.js";

const cookieFile = process.argv[2];
if (!cookieFile) throw new Error("Usage: node src/reorder.js /path/to/cookies.json");
const sessions = await loadSlackSessions(cookieFile, "hackclub");
const enterprise = sessions.find(s => String(s.auth.team_id).startsWith("E"));
const client = new SlackClient({ token: enterprise.token, cookie: enterprise.cookie, teamId: enterprise.auth.team_id });
const order = [
  "important", "talking", "personal channels", "volunteering", "tech",
  "Alchemize", "Blueprint", "HCTG", "Horizons", "macondo", "OneKey", "Outpost", "Pixl", "stardance",
  "small ysws", "helping", "free", "minecraft", "community", "bots & logs",
  "Fallout", "Flavortown", "Remixed", "Stasis", "bullshit"
];
let listed = await client.listCategories();
let sections = listed.channel_sections ?? [];
const byName = new Map(sections.map(section => [section.name.toLowerCase(), section]));
for (let index = order.length - 2; index >= 0; index--) {
  const section = byName.get(order[index].toLowerCase());
  const next = index + 1 < order.length ? byName.get(order[index + 1].toLowerCase()) : null;
  if (!section) throw new Error(`Missing category: ${order[index]}`);
  await client.setCategory(section.channel_section_id, { nextChannelSectionId: next?.channel_section_id ?? "" });
}
listed = await client.listCategories();
sections = listed.channel_sections ?? [];
const standard = sections.filter(section => section.type === "standard");
console.log(JSON.stringify({ ok: true, order: standard.map(section => section.name) }, null, 2));
