import { ScreenCapture } from "../src/plugins/desktop/ScreenCapture";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { execSync } from "child_process";

jest.mock("child_process");

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn()
}));

jest.mock("fs/promises", () => ({
  writeFile: jest.fn(),
  unlink: jest.fn(),
  mkdir: jest.fn(),
  readdir: jest.fn(),
  readFile: jest.fn(),
  rmdir: jest.fn(),
  copyFile: jest.fn()
}));

describe("ScreenCapture Temporal Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fsPromises.readdir as jest.Mock).mockResolvedValue(["frame_001.png", "frame_002.png"]);
    (fsPromises.readFile as jest.Mock).mockResolvedValue(Buffer.from("fake_image_data"));
    (fsPromises.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);
    (fsPromises.rmdir as jest.Mock).mockResolvedValue(undefined);
    (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
  });

  test("captureBurst should call ffmpeg with correct parameters", async () => {
    const mockExecSync = execSync as unknown as jest.Mock;
    mockExecSync.mockReturnValue(Buffer.from("done"));
    
    const frames = await ScreenCapture.captureBurst(1, 2);

    const ffmpegCall = mockExecSync.mock.calls.find(call => call[0].includes("ffmpeg"));
    expect(ffmpegCall).toBeDefined();
    expect(ffmpegCall[0]).toContain("-y -f gdigrab");
    expect(frames.length).toBe(2);
    expect(frames[0]).toBe(Buffer.from("fake_image_data").toString("base64"));
  });

  test("getVisualDiff should handle insufficient frames", async () => {
    const result = await ScreenCapture.getVisualDiff(["frame1"]);
    expect(result).toBe("Insufficient frames for diff.");
  });

  test("getVisualDiff should return temporal summary for valid frames", async () => {
    const result = await ScreenCapture.getVisualDiff(["frame1", "frame2"], { x: 0, y: 0, w: 100, h: 100 });
    expect(result).toContain("[Temporal Observation]");
    expect(result).toContain("region [x:0, y:0, w:100, h:100]");
  });

  test("captureBurst should return TIMEOUT_ERROR on ffmpeg timeout", async () => {
    const mockExecSync = execSync as unknown as jest.Mock;
    mockExecSync.mockImplementation(() => {
      const err = new Error("timeout");
      // @ts-ignore
      err.code = "ETIMEDOUT";
      throw err;
    });

    const frames = await ScreenCapture.captureBurst(1, 2);
    expect(frames).toEqual(["TIMEOUT_ERROR"]);
  });
});
