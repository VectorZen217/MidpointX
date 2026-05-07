import { ScreenCapture } from "../plugins/desktop/ScreenCapture";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { execSync } from "child_process";

jest.mock("child_process");

describe("ScreenCapture Temporal Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("captureBurst should call ffmpeg with correct parameters", async () => {
    const mockExecSync = execSync as jest.Mock;
    
    // Use manual mock assignment if spyOn fails
    (fs as any).existsSync = jest.fn().mockReturnValue(true);
    (fsPromises as any).readdir = jest.fn().mockResolvedValue(["frame_001.png", "frame_002.png"]);
    (fsPromises as any).readFile = jest.fn().mockResolvedValue(Buffer.from("fake_image_data"));
    (fsPromises as any).mkdir = jest.fn().mockResolvedValue(undefined);

    const frames = await ScreenCapture.captureBurst(1, 2);

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("ffmpeg -f gdigrab -framerate 2 -i desktop -t 1"),
      expect.any(Object)
    );
    expect(frames.length).toBe(2);
  });

  test("getVisualDiff should handle insufficient frames", async () => {
    const result = await ScreenCapture.getVisualDiff(["frame1"]);
    expect(result).toBe("Insufficient frames for diff.");
  });

  test("captureBurst should return TIMEOUT_ERROR on ffmpeg timeout", async () => {
    const mockExecSync = execSync as jest.Mock;
    mockExecSync.mockImplementation(() => {
      const err = new Error("timeout");
      // @ts-ignore
      err.code = "ETIMEDOUT";
      throw err;
    });

    const frames = await ScreenCapture.captureBurst(1, 2);
    expect(frames).toEqual(["TIMEOUT_ERROR"]);
  });

  test("getVisualDiff should report failure on timeout signal", async () => {
    const result = await ScreenCapture.getVisualDiff(["TIMEOUT_ERROR"]);
    expect(result).toContain("FAILED. FFMPEG timed out");
  });
});
