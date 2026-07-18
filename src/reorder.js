import { SlackClient } from "./slack.js";
import { loadSlackSessions } from "./session.js";

const cookieFile = process.argv[2];
if (!cookieFile) throw new Error("Usage: node src/reorder.js /path/to/cookies.json [--apply]");
const apply = process.argv.includes("--apply");
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
const missing = order.filter(name => !byName.has(name.toLowerCase()));
if (missing.length) throw new Error(`Missing categories: ${missing.join(", ")}`);
const plan = order.map((name, index) => ({
  name,
  channel_section_id: byName.get(name.toLowerCase()).channel_section_id,
  next_channel_section_id: index + 1 < order.length ? byName.get(order[index + 1].toLowerCase()).channel_section_id : null
}));
console.log(JSON.stringify({ apply, plan }, null, 2));
if (!apply) process.exit(0);
for (let index = plan.length - 2; index >= 0; index--) {
  await client.setCategory(plan[index].channel_section_id, { nextChannelSectionId: plan[index].next_channel_section_id });
}
listed = await client.listCategories();
sections = listed.channel_sections ?? [];
const standard = sections.filter(section => section.type === "standard");
const actualOrder = standard.map(section => section.name);
if (actualOrder.length !== order.length || actualOrder.some((name, index) => name !== order[index])) {
  throw new Error(`Category reorder could not be verified: ${JSON.stringify(actualOrder)}`);
}
console.log(JSON.stringify({ ok: true, order: actualOrder }, null, 2));
