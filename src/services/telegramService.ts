import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import { Config } from "../core/config";
import { ChannelRouter } from "../core/channelRouter";
import { VoiceService } from "./voiceService";

/**
 * TelegramService
 * Handles all communication with the Telegram Bot API with Voice support.
 */
export class TelegramService {
  private static bot: TelegramBot | null = null;
  private static io: Server | null = null;
  private static userChatMap: Map<string, number> = new Map(); // userId -> chatId
  private static userModeMap: Map<string, string> = new Map(); // userId -> "api" | "visual"

  static async init(io?: Server) {
    if (io) this.io = io;

    // Gracefully shutdown existing bot if re-initializing
    if (this.bot) {
      console.log("🔄 [TelegramService] Stopping existing bot instance for re-initialization...");
      try {
        await this.bot.stopPolling();
      } catch (e) {
        // Ignore errors during stop
      }
      this.bot = null;
    }

    const token = Config.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn("⚠️ [TelegramService] TELEGRAM_BOT_TOKEN not found. Telegram channel disabled.");
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: { params: { offset: -1 } } });

      // Catch generic bot errors to prevent Node process crashes
      this.bot.on("error", (error: any) => {
        console.warn("⚠️ [TelegramService] Underlying Bot Error:", error.message || error);
      });

      // Handle incoming text messages
      this.bot.on("message", async (msg) => {
        try {
          if (msg.from?.id) {
            this.userChatMap.set(String(msg.from.id), msg.chat.id);
          }
          if (msg.text && !msg.text.startsWith("/")) {
            await this.handleIntent(msg.chat.id, String(msg.from?.id || msg.chat.id), msg.text);
          }
        } catch (error: any) {
          console.error("❌ [TelegramService] Message processing failed:", error.message);
        }
      });

      // Handle voice messages (Phase 5)
      this.bot.on("voice", async (msg) => {
        const chatId = msg.chat.id;
        const fileId = msg.voice?.file_id;
        if (!fileId) return;

        console.log(`🎙️ [Telegram] Received voice message from ${msg.from?.username || msg.from?.id}`);
        await this.bot?.sendChatAction(chatId, "record_voice");

        try {
          const downloadDir = path.join(process.cwd(), "temp");
          if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

          const filePath = await this.bot?.downloadFile(fileId, downloadDir);
          if (!filePath) throw new Error("Failed to download voice file.");

          const transcription = await VoiceService.transcribe(filePath);
          fs.unlinkSync(filePath); // Cleanup

          await this.bot?.sendMessage(chatId, `📝 _Transcribed:_ "${transcription}"`, { parse_mode: "Markdown" });
          
          await this.handleIntent(chatId, String(msg.from?.id || chatId), transcription, true);
        } catch (error: any) {
          console.error("❌ [Telegram] Voice processing failed:", error.message);
          await this.bot?.sendMessage(chatId, `⚠️ Voice processing error: ${error.message}`);
        }
      });

      // Handle photo messages (External Photo Injection)
      this.bot.on("photo", async (msg) => {
        const chatId = msg.chat.id;
        const photos = msg.photo;
        if (!photos || photos.length === 0) return;

        // Get the largest photo
        const fileId = photos[photos.length - 1].file_id;
        console.log(`🖼️ [Telegram] Received photo injection from ${msg.from?.username || msg.from?.id}`);
        await this.bot?.sendChatAction(chatId, "upload_photo");

        try {
          const downloadDir = path.join(process.cwd(), "temp");
          if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

          const filePath = await this.bot?.downloadFile(fileId, downloadDir);
          if (!filePath) throw new Error("Failed to download photo.");

          const base64 = fs.readFileSync(filePath).toString("base64");
          fs.unlinkSync(filePath); // Cleanup

          await this.bot?.sendMessage(chatId, "📸 _Photo ingested for high-fidelity grounding. Analyzing..._", { parse_mode: "Markdown" });
          
          await this.handleIntent(chatId, String(msg.from?.id || chatId), msg.caption || "Analyze this photo.", false, [base64]);
        } catch (error: any) {
          console.error("❌ [Telegram] Photo processing failed:", error.message);
          await this.bot?.sendMessage(chatId, `⚠️ Photo processing error: ${error.message}`);
        }
      });

      // Handle button clicks (Human Doorbell & Mode Selection)
      this.bot.on("callback_query", async (query) => {
        try {
          const chatId = query.message?.chat.id;
          if (!chatId || !query.data) return;

          const dataParts = query.data.split(":");
          
          // Handle Mode Selection
          if (dataParts[0] === "setmode") {
            const mode = dataParts[1];
            const userId = dataParts[2];
            this.userModeMap.set(userId, mode);
            
            await this.bot?.answerCallbackQuery(query.id, { text: `Mode set to ${mode.toUpperCase()}` });
            await this.bot?.editMessageText(`✅ **Execution Mode Updated**\n\nYour tasks will now run in **${mode.toUpperCase()}** Mode.`, {
              chat_id: chatId,
              message_id: query.message?.message_id,
              parse_mode: "Markdown"
            });
            return;
          }

          // Handle Security Approvals
          const status = dataParts[0];
          const userId = dataParts[1];
          const approved = status === "approve";

          await this.bot?.answerCallbackQuery(query.id, { text: approved ? "Executing..." : "Aborting..." });
          
          await this.bot?.editMessageText(`🔔 **Action ${approved ? "Approved" : "Denied"}**\nTool: \`${query.message?.text?.split('\n')[4] || 'N/A'}\``, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: "Markdown"
          });

          if (approved) await this.bot?.sendChatAction(chatId, "typing");

          const response = await ChannelRouter.resume(userId, approved, (update) => {
            this.io?.emit("agent:progress", update);
          });

          // 1. Handle Nested Approvals (Phase 4)
          if (typeof response === "object" && (response as any).needsApproval) {
            const result = response as any;
            await this.bot?.sendMessage(chatId, `🔔 **Security Approval Required (Next Step)**\n\nI want to execute:\n\n\`${result.action.tool}\`\nArguments: \`${JSON.stringify(result.action.args)}\`\n\nDo you approve?`, {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "✅ Approve", callback_data: `approve:${userId}` },
                   { text: "❌ Deny", callback_data: `deny:${userId}` }]
                ]
              }
            });
            return; // Exit early, wait for next button click
          }

          // 2. Handle Final Outcomes
          let textResponse = "";
          let artifacts: any[] = [];
          if (typeof response === "object" && (response as any).message) {
            textResponse = (response as any).message;
            artifacts = (response as any).artifacts || [];
          } else {
            textResponse = String(response || "Task completed.");
          }
          
          // Use TTS for resumption response if enabled
          if (Config.ENABLE_VOICE) {
             try {
               const audio = await VoiceService.synthesize(textResponse);
               await this.bot?.sendVoice(chatId, audio);
             } catch (e) {
               await this.bot?.sendMessage(chatId, textResponse);
             }
          } else {
             await this.bot?.sendMessage(chatId, textResponse);
          }

          // 3. Notify UI of completion (Sync Active Session window)
          this.io?.emit("agent:message", { message: textResponse, artifacts });
          this.io?.emit("agent:complete", { message: "Mission Accomplished" });

          // Deliver Artifacts
          for (const art of artifacts) {
            if (art.type === 'file' && fs.existsSync(art.path)) {
              try {
                if (art.path.match(/\.(png|jpg|jpeg)$/i)) {
                  await this.bot?.sendPhoto(chatId, art.path);
                } else {
                  await this.bot?.sendDocument(chatId, art.path);
                }
              } catch (err: any) {
                console.error(`❌ [Telegram] Artifact delivery failed:`, err.message);
              }
            }
          }
        } catch (error: any) {
          console.error("❌ [TelegramService] Callback query processing failed:", error.message);
        }
      });

      // Command handling
      this.bot.onText(/\/start/, (msg) => {
        this.bot?.sendMessage(msg.chat.id, "MidpointX online. Ready for tasking.");
      });

      this.bot.onText(/\/mode/, (msg) => {
        this.bot?.sendMessage(msg.chat.id, "Select execution mode.", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "API Mode", callback_data: `setmode:api:${msg.from?.id}` },
               { text: "Visual Mode", callback_data: `setmode:visual:${msg.from?.id}` }]
            ]
          }
        });
      });

      // Error handling for polling (e.g. 401 Unauthorized)
      this.bot.on("polling_error", (error: any) => {
        if (error.code === "ETELEGRAM" && error.message.includes("401 Unauthorized")) {
          console.error("❌ [TelegramService] 401 Unauthorized: Invalid Bot Token. Disabling Telegram polling.");
          this.bot?.stopPolling();
          this.bot = null;
        } else {
          console.warn("⚠️ [TelegramService] Polling error:", error.message);
        }
      });

      console.log("✅ [TelegramService] Telegram Bot initialized with Voice/Vision support.");

    } catch (error: any) {
      console.error("❌ [TelegramService] Initialization failed:", error.message);
    }
  }

  /**
   * Internal helper to route intents to the graph and handle responses.
   */
  private static async handleIntent(chatId: number, userId: string, intent: string, isVoice: boolean = false, highFidelityContext?: string[]) {
    console.log(`💬 [Telegram] Routing intent: ${intent}`);
    await this.bot?.sendChatAction(chatId, isVoice ? "record_voice" : "typing");

    const mode = this.userModeMap.get(userId) || "api";
    const result = await ChannelRouter.route({ userId, intent, channel: "telegram", highFidelityContext, executionMode: mode }, (update) => {
      // Sync progress with Web UI
      this.io?.emit("agent:progress", update);
    });

    if (typeof result === "object" && result.needsApproval) {
      await this.bot?.sendMessage(chatId, `🔔 **Security Approval Required**\n\nI want to execute:\n\n\`${result.action.tool}\`\nArguments: \`${JSON.stringify(result.action.args)}\`\n\nDo you approve?`, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Approve", callback_data: `approve:${userId}` },
             { text: "❌ Deny", callback_data: `deny:${userId}` }]
          ]
        }
      });
    } else {
      let textResponse = "";
      let artifacts: any[] = [];

      if (typeof result === "object" && result.message) {
        textResponse = result.message;
        artifacts = result.artifacts || [];
      } else {
        textResponse = result as string;
      }

      if (Config.ENABLE_VOICE && isVoice) {
        try {
          const audio = await VoiceService.synthesize(textResponse);
          await this.bot?.sendVoice(chatId, audio);
        } catch (e) {
          await this.bot?.sendMessage(chatId, textResponse);
        }
      } else {
        await this.bot?.sendMessage(chatId, textResponse);
      }
      
      // Deliver Artifacts
      for (const art of artifacts) {
        if (art.type === 'file' && fs.existsSync(art.path)) {
          console.log(`📤 [Telegram] Sending artifact: ${art.path}`);
          try {
            if (art.path.match(/\.(png|jpg|jpeg)$/i)) {
              await this.bot?.sendPhoto(chatId, art.path);
            } else {
              await this.bot?.sendDocument(chatId, art.path);
            }
          } catch (err: any) {
            console.error(`❌ [Telegram] Failed to send artifact ${art.path}:`, err.message);
          }
        }
      }
      
      // Notify UI of completion
      this.io?.emit("agent:message", { message: textResponse, artifacts });
      this.io?.emit("agent:complete", { message: "Mission Accomplished" });
    }
  }

  /**
   * Proactive messaging tool (Phase 5)
   */
  public static async sendMessage(text: string, userId?: string) {
    if (!this.bot) return "Telegram bot not initialized.";
    
    // If no userId, send to the first/most recent active chat
    let chatId = userId ? this.userChatMap.get(userId) : Array.from(this.userChatMap.values())[0];
    
    if (!chatId) {
      console.warn("⚠️ [Telegram] No active chat session found to send proactive message.");
      return "No active Telegram session.";
    }

    await this.bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
    return `Message sent to Telegram chat ${chatId}`;
  }
}
