import https from "https";
import { Config } from "../core/config";
import type { Connector, InboundEvent } from "../core/integrationBus";

function slackPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "slack.com",
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Bearer ${Config.SLACK_BOT_TOKEN}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export const SlackConnector: Connector = {
  id: "slack",

  async send(channel: string, message: string): Promise<void> {
    if (!Config.SLACK_BOT_TOKEN) {
      console.warn("[SlackConnector] SLACK_BOT_TOKEN not set — message dropped");
      return;
    }
    const result = await slackPost("/api/chat.postMessage", {
      channel: channel || Config.SLACK_DEFAULT_CHANNEL,
      text: message,
    });
    if (!(result as any).ok) {
      throw new Error(`[SlackConnector] API error: ${(result as any).error}`);
    }
  },

  receive(_handler: (event: InboundEvent) => void): void {
    // Inbound Slack events arrive via webhook — handled by integrationRoutes
  },

  async healthCheck(): Promise<boolean> {
    if (!Config.SLACK_BOT_TOKEN) return false;
    try {
      const result = await slackPost("/api/auth.test", {});
      return (result as any).ok === true;
    } catch {
      return false;
    }
  },
};
