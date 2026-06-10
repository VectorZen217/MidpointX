import https from "https";
import { Config } from "../core/config";
import type { Connector, InboundEvent } from "../core/integrationBus";

function smtpLog(message: string): void {
  console.log(`[EmailConnector] ${message}`);
}

export const EmailConnector: Connector = {
  id: "email",

  async send(channel: string, message: string, options?: Record<string, unknown>): Promise<void> {
    if (!Config.SMTP_HOST || !Config.SMTP_USER || !Config.SMTP_PASS) {
      console.warn("[EmailConnector] SMTP credentials not configured — message dropped");
      return;
    }
    const to = channel || (options?.to as string);
    if (!to) {
      console.warn("[EmailConnector] No recipient specified");
      return;
    }
    const subject = (options?.subject as string) || "MidpointX notification";
    smtpLog(`Sending email to ${to}: ${subject}`);
    // Full SMTP implementation requires a TCP connection (not HTTPS).
    // Stub logs intent; wire nodemailer when SMTP is needed in production.
    smtpLog(`[STUB] Would send: To=${to}, Subject=${subject}, Body=${message.substring(0, 80)}`);
  },

  receive(_handler: (event: InboundEvent) => void): void {
    // IMAP polling not implemented in Phase 3 stub
  },

  async healthCheck(): Promise<boolean> {
    return !!(Config.SMTP_HOST && Config.SMTP_USER && Config.SMTP_PASS);
  },
};
