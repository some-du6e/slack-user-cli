import fs from "node:fs/promises";

function cookieHeader(cookies) {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
}

export async function loadSlackSessions(cookieFile, workspace, fetchImpl = fetch) {
  const parsed = JSON.parse(await fs.readFile(cookieFile, "utf8"));
  const cookies = Array.isArray(parsed) ? parsed : parsed.cookies;
  if (!Array.isArray(cookies)) throw new Error("Cookie file must be a JSON cookie array or { cookies: [...] }");
  const cookie = cookieHeader(cookies);
  const target = workspace
    ? `https://${workspace.replace(/\.slack\.com$/, "")}.slack.com/ssb/redirect`
    : "https://app.slack.com/client";
  const response = await fetchImpl(target, { headers: { cookie, "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`Slack session bootstrap failed with HTTP ${response.status}`);
  const html = await response.text();
  const tokenCandidates = [...new Set([...html.matchAll(/xoxc-[A-Za-z0-9-]+/g)].map(match => match[0]))];
  if (!tokenCandidates.length && !workspace) {
    const domain = [...html.matchAll(/https:\/\/([a-zA-Z0-9-]+)\.slack\.com/g)]
      .map(match => match[1])
      .find(name => !["api", "app"].includes(name));
    if (domain) return loadSlackSessions(cookieFile, domain, fetchImpl);
  }
  const sessions = [];
  for (const token of tokenCandidates) {
    const auth = await fetchImpl("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" },
      body: new URLSearchParams({ token })
    });
    const payload = await auth.json();
    if (payload.ok) sessions.push({ token, cookie, auth: payload });
  }
  if (!sessions.length) throw new Error("Cookie session did not yield an authenticated Slack workspace token");
  return sessions;
}

export async function loadSlackSession(cookieFile, workspace, fetchImpl = fetch, sessionIndex = 0) {
  const sessions = await loadSlackSessions(cookieFile, workspace, fetchImpl);
  if (!sessions[sessionIndex]) throw new Error(`Session index ${sessionIndex} does not exist (found ${sessions.length})`);
  return sessions[sessionIndex];
}
