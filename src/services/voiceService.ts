import axios from "axios";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import { Config } from "../core/config";

/**
 * VoiceService
 * Orchestrates STT (Speech-to-Text) and TTS (Text-to-Speech).
 */
export class VoiceService {
  private static openai = Config.OPENAI_API_KEY ? new OpenAI({ apiKey: Config.OPENAI_API_KEY }) : null;

  /**
   * Transcribes an audio file using OpenAI Whisper.
   */
  static async transcribe(filePath: string): Promise<string> {
    if (!this.openai) {
      throw new Error("OPENAI_API_KEY is required for voice transcription.");
    }

    console.log(`🎙️ [VoiceService] Transcribing audio file: ${path.basename(filePath)}`);
    
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
      });
      return response.text;
    } catch (error: any) {
      console.error("❌ [VoiceService] Transcription failed:", error.message);
      throw error;
    }
  }

  /**
   * Converts text to speech using ElevenLabs (primary) or OpenAI TTS (fallback).
   */
  static async synthesize(text: string): Promise<Buffer> {
    if (Config.ELEVENLABS_API_KEY) {
      return this.synthesizeElevenLabs(text);
    } else if (this.openai) {
      return this.synthesizeOpenAI(text);
    } else {
      throw new Error("No TTS provider configured (ElevenLabs or OpenAI).");
    }
  }

  private static async synthesizeElevenLabs(text: string): Promise<Buffer> {
    console.log("🗣️ [VoiceService] Synthesizing speech via ElevenLabs...");
    try {
      const response = await axios({
        method: "POST",
        url: `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`, // Default 'Rachel' voice
        data: { text, model_id: "eleven_monolingual_v1" },
        headers: {
          "xi-api-key": Config.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      });
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error("❌ [VoiceService] ElevenLabs synthesis failed:", error.message);
      throw error;
    }
  }

  private static async synthesizeOpenAI(text: string): Promise<Buffer> {
    console.log("🗣️ [VoiceService] Synthesizing speech via OpenAI TTS...");
    if (!this.openai) throw new Error("OpenAI not initialized");
    
    try {
      const response = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: text,
      });
      return Buffer.from(await response.arrayBuffer());
    } catch (error: any) {
      console.error("❌ [VoiceService] OpenAI TTS failed:", error.message);
      throw error;
    }
  }
}
