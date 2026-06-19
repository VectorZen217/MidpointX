import "dotenv/config";

interface ServiceResult {
  service: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

async function getToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google credentials missing from .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description ?? data.error ?? "unknown"}`);
  }
  return data.access_token;
}

async function probe(service: string, url: string, token: string): Promise<ServiceResult> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json() as Record<string, unknown>;
    if (res.status === 200) {
      const keys = Object.keys(data).slice(0, 4).join(", ");
      return { service, status: "PASS", detail: `keys: [${keys}]` };
    }
    const errMsg = (data.error as any)?.message ?? JSON.stringify(data).slice(0, 100);
    return { service, status: "FAIL", detail: `HTTP ${res.status}: ${errMsg}` };
  } catch (e: any) {
    return { service, status: "FAIL", detail: e.message };
  }
}

async function main() {
  console.log("\n=== MidpointX Google Workspace Access Verification ===");
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  let token: string;
  try {
    token = await getToken();
    console.log("✅ OAuth2 token refresh: PASS\n");
  } catch (e: any) {
    console.error("❌ OAuth2 token refresh: FAIL —", e.message);
    process.exit(1);
  }

  const results: ServiceResult[] = await Promise.all([
    probe("Gmail profile",       "https://gmail.googleapis.com/gmail/v1/users/me/profile", token),
    probe("Gmail inbox (1 msg)", "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&labelIds=INBOX", token),
    probe("Google Drive (root)", "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)", token),
    probe("Google Calendar",     "https://www.googleapis.com/calendar/v3/calendars/primary", token),
    probe("Google Tasks",        "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=1", token),
    probe("Google Docs API",     "https://docs.googleapis.com/$discovery/rest?version=v1", token),
    probe("Google Sheets API",   "https://sheets.googleapis.com/$discovery/rest?version=v4", token),
    probe("People API",          "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses", token),
  ]);

  const colW = 24;
  console.log("Service".padEnd(colW) + "| Status | Detail");
  console.log("-".repeat(colW) + "|--------|" + "-".repeat(50));
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "SKIP" ? "⏭️ " : "❌";
    console.log(`${icon} ${r.service.padEnd(colW - 3)}| ${r.status.padEnd(6)} | ${r.detail}`);
  }

  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log(`\n${passed}/${results.length} Google services accessible.`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} service(s) returned errors. Common causes:`);
    console.log("   • 403 insufficient_scope  → Re-authorize with broader scopes in Google Cloud Console");
    console.log("   • 401 invalid_grant       → Refresh token expired or revoked; re-authorize");
    console.log("   • 404                     → API not enabled in Google Cloud Console project");
    console.log("\n   Required OAuth scopes for full access:");
    console.log("   https://www.googleapis.com/auth/gmail.readonly");
    console.log("   https://www.googleapis.com/auth/drive.readonly");
    console.log("   https://www.googleapis.com/auth/calendar.readonly");
    console.log("   https://www.googleapis.com/auth/tasks.readonly");
    console.log("   https://www.googleapis.com/auth/spreadsheets.readonly");
    console.log("   https://www.googleapis.com/auth/documents.readonly");
  }
}

main().catch(console.error);
