import { SlackClient } from "./slack.js";
import { loadSlackSessions } from "./session.js";

const COOKIE_FILE = process.argv[2];
if (!COOKIE_FILE) throw new Error("Usage: node src/organize.js /path/to/cookies.json --apply");
const APPLY = process.argv.includes("--apply");

const sessions = await loadSlackSessions(COOKIE_FILE, "hackclub");
const workspace = sessions.find(s => String(s.auth.team_id).startsWith("T"));
const enterprise = sessions.find(s => String(s.auth.team_id).startsWith("E"));
if (!workspace || !enterprise) throw new Error("Both workspace and enterprise Slack sessions are required");
const channelsClient = new SlackClient({ token: workspace.token, cookie: workspace.cookie, teamId: workspace.auth.team_id });
const categoryClient = new SlackClient({ token: enterprise.token, cookie: enterprise.cookie, teamId: enterprise.auth.team_id });

const channels = await channelsClient.listChannels();
let sectionResponse = await categoryClient.listCategories();
let sections = sectionResponse.channel_sections ?? [];
const standard = () => sections.filter(s => s.type === "standard");
const findSection = name => standard().find(s => s.name.toLowerCase() === name.toLowerCase());

async function rename(oldName, newName) {
  const section = findSection(oldName);
  if (!section || section.name === newName) return;
  if (APPLY) await categoryClient.setCategory(section.channel_section_id, { name: newName });
  section.name = newName;
}

await rename("yswses", "small ysws");
await rename("volunteering (red-team)", "volunteering");

const categoryIcons = {
  important: "rotating_light",
  talking: "speech_balloon",
  "personal channels": "house",
  volunteering: "handshake",
  tech: "computer",
  helping: "question",
  free: "gift",
  minecraft: "pick",
  community: "busts_in_silhouette",
  "bots & logs": "robot_face",
  "small ysws": "package",
  bullshit: "wastebasket",
  Alchemize: "alchemize",
  Blueprint: "blueprint",
  Fallout: "fallout-fire",
  Flavortown: "flavortown",
  HCTG: "hctg",
  Horizons: "horizons",
  macondo: "macondo",
  OneKey: "onekey",
  Outpost: "outpost",
  Pixl: "pixl",
  Remixed: "remixed",
  stardance: "stardance_star",
  Stasis: "stasis"
};
const standardEmoji = new Set(["rotating_light", "speech_balloon", "house", "handshake", "computer", "question", "gift", "pick", "busts_in_silhouette", "robot_face", "package", "wastebasket"]);
const emojiResponse = await categoryClient.call("emoji.list");
const customEmoji = new Set(Object.keys(emojiResponse.emoji ?? {}));
for (const name of Object.keys(categoryIcons)) {
  const emoji = categoryIcons[name];
  if (!standardEmoji.has(emoji) && !customEmoji.has(emoji)) categoryIcons[name] = "package";
}

const desiredOrder = [
  "important", "talking", "personal channels", "volunteering", "tech",
  "Alchemize", "Blueprint", "HCTG", "Horizons", "macondo", "OneKey", "Outpost", "Pixl", "stardance",
  "small ysws", "helping", "free", "minecraft", "community", "bots & logs",
  "Fallout", "Flavortown", "Remixed", "Stasis", "bullshit"
];

for (const name of desiredOrder) {
  let section = findSection(name);
  if (!section) {
    if (!APPLY) {
      section = { channel_section_id: `DRY-${name}`, name, emoji: categoryIcons[name], type: "standard", channel_ids_page: { channel_ids: [] } };
      sections.push(section);
    } else {
      const created = await categoryClient.createCategory(name, categoryIcons[name]);
      sectionResponse = await categoryClient.listCategories();
      sections = sectionResponse.channel_sections ?? [];
      section = sections.find(s => s.channel_section_id === created.channel_section_id);
    }
  }
  if (APPLY && section.emoji !== categoryIcons[name]) await categoryClient.setCategoryIcon(section.channel_section_id, categoryIcons[name]);
}

if (APPLY) {
  sectionResponse = await categoryClient.listCategories();
  sections = sectionResponse.channel_sections ?? [];
}
const currentCategory = new Map();
for (const section of sections) for (const id of section.channel_ids_page?.channel_ids ?? []) currentCategory.set(id, section.name);

const dedicated = {
  alchemize: "Alchemize", blueprint: "Blueprint", fallout: "Fallout", flavortown: "Flavortown",
  hctg: "HCTG", horizons: "Horizons", macondo: "macondo", onekey: "OneKey", outpost: "Outpost",
  pixl: "Pixl", remixed: "Remixed", stardance: "stardance", stasis: "Stasis"
};
const grouped = new Map(desiredOrder.map(name => [name, []]));
const exact = (name, values) => values.includes(name);

for (const channel of channels) {
  const n = channel.name.toLowerCase();
  let target;
  for (const [prefix, category] of Object.entries(dedicated)) {
    if (n === prefix || n.startsWith(`${prefix}-`) || (prefix === "hctg" && n === "hack-club-the-game")) { target = category; break; }
  }
  if (!target && (n === "flaron" || n === "flaron-do-not-log-me" || exact(n, ["og", "rare", "opsec"]))) target = "bullshit";
  if (!target && (n === "jackpot" || n === "jackpot-help" || currentCategory.get(channel.id) === "small ysws" || /-ysws(?:-|$)/.test(n))) target = "small ysws";
  if (!target && (currentCategory.get(channel.id) === "volunteering" || exact(n, ["red-team", "red-team-applications", "gorkie-beta-testing", "alchemize-bugs"]) || /volunteer|applications|organizer/.test(n))) target = "volunteering";
  if (!target && (currentCategory.get(channel.id) === "important" || exact(n, ["announcements", "happenings", "hc-opportunities", "community-announcements"]))) target = "important";
  if (!target && (currentCategory.get(channel.id) === "talking" || exact(n, ["lounge", "meta", "takes", "self", "ship", "confessions", "confessions-log", "confessions-meta"]))) target = "talking";
  if (!target && (currentCategory.get(channel.id) === "minecraft" || /minecraft|mc-modding/.test(n))) target = "minecraft";
  if (!target && (currentCategory.get(channel.id) === "helping" || n === "hackatime-help" || n === "help" || /(?:^|-)help$|support$/.test(n))) target = "helping";
  if (!target && (currentCategory.get(channel.id) === "free" || /free-|bounty|stickers?$|grants?$/.test(n))) target = "free";
  const personalSignal = `${n} ${channel.topic?.value ?? ""} ${channel.purpose?.value ?? ""}`;
  if (!target && (n === "seven-eight-nine" || currentCategory.get(channel.id) === "personal channels" || ["eps-conduit", "ingo-commits-academic-fraud"].includes(n) || /personal channel|yap(?:ping)? (?:channel|to)|where i post|my (?:main )?channel|little .*channel|random (?:shit|stuff)|(?:^|-)(?:basement|speaks|container|corner|fan-club|treehole)$/.test(personalSignal))) target = "personal channels";
  if (!target && /bot|logs?$|monitor|bridge|feed$/.test(n)) target = "bots & logs";
  if (!target && /(?:^|-)ai(?:-|$)|code|program|develop|engineering|hardware|3d-|printing|cyber|security|dns|cdn|godot|homelab|tech|dev$|slack-api|hackatime/.test(n)) target = "tech";
  if (!target && /community|alumni|costa-rica|muslim|identity|parliament|regional|welcome|club|^hq$|^hcb$|hall-of-fame|^amas$|scrapbook|new-channels|^neighbourhood$/.test(n)) target = "community";
  if (!target && channel.is_private) target = "personal channels";
  if (!target) target = "bullshit";
  grouped.get(target).push(channel.id);
}

const summary = Object.fromEntries([...grouped].map(([name, ids]) => [name, ids.length]));
console.log(JSON.stringify({ apply: APPLY, total: channels.length, summary }, null, 2));
if (!APPLY) process.exit(0);

for (const name of desiredOrder) {
  const section = findSection(name);
  const ids = grouped.get(name);
  for (let index = 0; index < ids.length; index += 75) {
    await categoryClient.assignChannels(section.channel_section_id, ids.slice(index, index + 75));
  }
}

for (const obsolete of ["Flaron", "corny thing with shop"]) {
  const section = findSection(obsolete);
  if (section) await categoryClient.deleteCategory(section.channel_section_id);
}

console.log(JSON.stringify({ ok: true, applied: summary }, null, 2));
