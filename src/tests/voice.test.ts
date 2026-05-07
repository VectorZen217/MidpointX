process.env.ACTIVE_MODEL_NAME = "test";
process.env.WORKER_MODEL_NAME = "test";

import { VoiceService } from "../services/voiceService";
import { Config } from "../core/config";
import OpenAI from "openai";
import axios from "axios";

jest.mock("openai");
jest.mock("axios");
jest.mock("fs", () => ({
  createReadStream: jest.fn().mockReturnValue("mock_stream"),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn()
}));

describe("VoiceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Config.OPENAI_API_KEY = "test_key";
    Config.ELEVENLABS_API_KEY = "test_key";
  });

  it("should call OpenAI Whisper for transcription", async () => {
    const mockCreate = jest.fn().mockResolvedValue({ text: "Hello world" });
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      audio: { transcriptions: { create: mockCreate } }
    }));

    // Re-initialize service internal openai client for test
    (VoiceService as any).openai = new OpenAI({ apiKey: "test" });

    const result = await VoiceService.transcribe("test.ogg");
    expect(result).toBe("Hello world");
    expect(mockCreate).toHaveBeenCalled();
  });

  it("should call ElevenLabs for synthesis if API key is present", async () => {
    (axios as unknown as jest.Mock).mockResolvedValue({ data: Buffer.from("audio_data") });

    const result = await VoiceService.synthesize("Hello");
    expect(result.toString()).toBe("audio_data");
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining("elevenlabs.io")
    }));
  });
});
