import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Server as SocketServer } from "socket.io";
import { Config } from "../core/config";
import { ChannelRouter } from "../core/channelRouter";

/**
 * DiscordService
 * Handles communication with Discord with Human Doorbell support.
 */
export class DiscordService {
  private static client: Client | null = null;
  private static io: SocketServer | null = null;

  static async init(io?: SocketServer) {
    if (io) this.io = io;

    // Gracefully shutdown existing client if re-initializing
    if (this.client) {
      console.log("🔄 [DiscordService] Destroying existing client for re-initialization...");
      this.client.destroy();
      this.client = null;
    }

    const token = Config.DISCORD_BOT_TOKEN;
    if (!token) {
      console.warn("⚠️ [DiscordService] DISCORD_BOT_TOKEN not found. Discord channel disabled.");
      return;
    }

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
        partials: [Partials.Channel],
      });

      this.client.on("ready", () => {
        console.log(`✅ [DiscordService] Discord Bot logged in as ${this.client?.user?.tag}`);
      });

      this.client.on("messageCreate", async (message) => {
        if (message.author.bot) return;

        const isDM = message.channel.isDMBased();
        const isMentioned = this.client?.user && message.mentions.has(this.client.user);

        if (isDM || isMentioned) {
          const cleanContent = isMentioned 
            ? message.content.replace(/<@!?[0-9]+>/g, "").trim()
            : message.content;

          if (!cleanContent) return;

          console.log(`💬 [Discord] Inbound from ${message.author.tag}: ${cleanContent}`);
          try { await message.channel.sendTyping(); } catch (e) {}

          const highFidelityContext: string[] = [];
          if (message.attachments.size > 0) {
            for (const [id, attachment] of message.attachments) {
              if (attachment.contentType?.startsWith("image/")) {
                try {
                  const response = await fetch(attachment.url);
                  const arrayBuffer = await response.arrayBuffer();
                  const buffer = Buffer.from(arrayBuffer);
                  highFidelityContext.push(buffer.toString("base64"));
                  console.log(`🖼️ [Discord] Injected photo attachment: ${attachment.name}`);
                } catch (err: any) {
                  console.error(`❌ [Discord] Failed to download attachment: ${err.message}`);
                }
              }
            }
          }

          const result = await ChannelRouter.route({
            userId: message.author.id,
            intent: cleanContent,
            channel: "discord",
            highFidelityContext
          }, (update) => {
            this.io?.emit("agent:progress", update);
          });

          if (typeof result === "object" && result.needsApproval) {
            // Human Doorbell Buttons
            const row = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`approve:${message.author.id}`)
                  .setLabel("Approve Action")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`deny:${message.author.id}`)
                  .setLabel("Deny")
                  .setStyle(ButtonStyle.Danger),
              );

            await message.reply({
              content: `🔔 **Security Approval Required**\nI want to run: \`${result.action.tool}\`\nArgs: \`${JSON.stringify(result.action.args)}\`\n\nDo you authorize this?`,
              components: [row]
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

            await message.reply(textResponse);
            this.io?.emit("agent:message", { message: textResponse, artifacts });
            this.io?.emit("agent:complete", { message: "Mission Accomplished" });
            
            // Basic artifact notification for Discord
            if (artifacts.length > 0) {
              await message.channel.send(`📤 I have produced ${artifacts.length} artifacts. Please check the Web UI to download them.`);
            }
          }
        }
      });

      // Handle Button Interactions
      this.client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;

        const [status, userId] = interaction.customId.split(":");
        if (interaction.user.id !== userId) {
          return interaction.reply({ content: "Only the original requestor can approve this.", ephemeral: true });
        }

        const approved = status === "approve";
        await interaction.update({ 
          content: `🔔 **Action ${approved ? "Approved" : "Denied"}**\nResuming execution...`, 
          components: [] 
        });

        const response = await ChannelRouter.resume(userId, approved, (update) => {
          this.io?.emit("agent:progress", update);
        });

        let textResponse = "";
        let artifacts: any[] = [];
        if (typeof response === "object" && (response as any).message) {
          textResponse = (response as any).message;
          artifacts = (response as any).artifacts || [];
        } else {
          textResponse = response as string;
        }

        await interaction.followUp(textResponse);
        this.io?.emit("agent:message", { message: textResponse, artifacts });
        this.io?.emit("agent:complete", { message: "Mission Accomplished" });
      });

      await this.client.login(token);

    } catch (error: any) {
      console.error("❌ [DiscordService] Initialization failed:", error.message);
    }
  }
}
