import https from "https";
import { Config } from "../core/config";
import type { Connector, InboundEvent } from "../core/integrationBus";

function githubRequest(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: "api.github.com",
        path,
        method: body ? "POST" : "GET",
        headers: {
          "User-Agent": "MidpointX/1.0",
          "Authorization": `Bearer ${Config.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export const GitHubConnector: Connector = {
  id: "github",

  async send(channel: string, message: string, options?: Record<string, unknown>): Promise<void> {
    if (!Config.GITHUB_TOKEN) {
      console.warn("[GitHubConnector] GITHUB_TOKEN not set — message dropped");
      return;
    }
    const repo = (options?.repo as string) || Config.GITHUB_DEFAULT_REPO;
    if (!repo) {
      console.warn("[GitHubConnector] No repo specified and GITHUB_DEFAULT_REPO not set");
      return;
    }
    const title = (options?.title as string) || channel || "MidpointX notification";
    await githubRequest(`/repos/${repo}/issues`, { title, body: message });
  },

  receive(_handler: (event: InboundEvent) => void): void {
    // Inbound GitHub webhooks handled by integrationRoutes
  },

  async healthCheck(): Promise<boolean> {
    if (!Config.GITHUB_TOKEN) return false;
    try {
      const result = await githubRequest("/user");
      return !!(result as any).login;
    } catch {
      return false;
    }
  },
};
