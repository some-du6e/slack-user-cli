const DEFAULT_BASE_URL = "https://slack.com/api";

export class SlackError extends Error {
  constructor(method, error, response) {
    super(`${method}: ${error}`);
    this.name = "SlackError";
    this.method = method;
    this.code = error;
    this.response = response;
  }
}

export class SlackClient {
  constructor({ token, cookie, teamId, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch }) {
    if (!token) throw new Error("SLACK_TOKEN is required");
    this.token = token;
    this.cookie = cookie;
    this.teamId = teamId;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  async call(method, params = {}) {
    const body = new URLSearchParams({ token: this.token });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) body.set(key, String(value));
    }

    const headers = { "content-type": "application/x-www-form-urlencoded" };
    if (this.cookie) headers.cookie = this.cookie;
    const response = await this.fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers,
      body
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`${method}: Slack returned HTTP ${response.status}, not JSON`);
    }
    if (!response.ok || !payload.ok) {
      throw new SlackError(method, payload.error ?? `HTTP ${response.status}`, payload);
    }
    return payload;
  }

  async listChannels() {
    const channels = [];
    let cursor = "";
    do {
      const page = await this.call("users.conversations", {
        types: "public_channel,private_channel",
        exclude_archived: "true",
        limit: 200,
        cursor
      });
      channels.push(...(page.channels ?? []));
      cursor = page.response_metadata?.next_cursor ?? "";
    } while (cursor);
    return channels;
  }

  listCategories() {
    return this.call("users.channelSections.list", { team_id: this.teamId });
  }

  async setCategoryIcon(sectionId, emoji) {
    const listed = await this.listCategories();
    const section = (listed.channel_sections ?? []).find(item => item.channel_section_id === sectionId);
    if (!section) throw new Error(`Category not found: ${sectionId}`);
    return this.call("users.channelSections.set", {
      team_id: this.teamId,
      channel_section_id: section.channel_section_id,
      name: section.name,
      emoji,
      next_channel_section_id: section.next_channel_section_id ?? ""
    });
  }

  async setCategory(sectionId, fields) {
    const listed = await this.listCategories();
    const section = (listed.channel_sections ?? []).find(item => item.channel_section_id === sectionId);
    if (!section) throw new Error(`Category not found: ${sectionId}`);
    return this.call("users.channelSections.set", {
      team_id: this.teamId,
      channel_section_id: section.channel_section_id,
      name: fields.name ?? section.name,
      emoji: fields.emoji ?? section.emoji ?? "",
      next_channel_section_id: fields.nextChannelSectionId ?? section.next_channel_section_id ?? ""
    });
  }

  async searchEmoji(query) {
    const result = await this.call("emoji.list");
    const needle = query.toLowerCase();
    return Object.keys(result.emoji ?? {}).filter(name => name.toLowerCase().includes(needle)).sort();
  }

  async createCategory(name, emoji = "bookmark_tabs", channelIds = []) {
    const created = await this.call("users.channelSections.create", { team_id: this.teamId, name, emoji });
    if (channelIds.length) await this.assignChannels(created.channel_section_id, channelIds);
    return created;
  }

  deleteCategory(sectionId) {
    return this.call("users.channelSections.delete", { team_id: this.teamId, channel_section_id: sectionId });
  }

  async assignChannels(sectionId, channelIds) {
    const listed = await this.listCategories();
    const sections = listed.channel_sections ?? [];
    const target = sections.find(section => section.channel_section_id === sectionId);
    if (!target) throw new Error(`Category not found: ${sectionId}`);
    const alreadyAssigned = new Set(target.channel_ids_page?.channel_ids ?? []);
    const toInsert = channelIds.filter(id => !alreadyAssigned.has(id));
    if (!toInsert.length) return { ok: true, unchanged: true };
    const wanted = new Set(toInsert);
    const remove = sections
      .filter(section => section.channel_section_id !== sectionId)
      .map(section => ({
        channel_section_id: section.channel_section_id,
        channel_ids: (section.channel_ids_page?.channel_ids ?? []).filter(id => wanted.has(id))
      }))
      .filter(change => change.channel_ids.length);
    return this.call("users.channelSections.channels.bulkUpdate", {
      team_id: this.teamId,
      remove: JSON.stringify(remove),
      insert: JSON.stringify([{ channel_section_id: sectionId, channel_ids: toInsert }])
    });
  }
}
