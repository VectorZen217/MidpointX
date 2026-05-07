import { ScreenCapture } from "../src/plugins/desktop/ScreenCapture";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { exec } from "child_process";

jest.mock("child_process");
jest.mock("fs");
jest.mock("fs/promises");

describe("ScreenCapture Temporal Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("captureBurst should call ffmpeg with correct parameters", async () => {
    const mockExec = exec as unknown as jest.Mock;
    mockExec.mockImplementation((cmd, cb) => cb(null, { stdout: "done" }));
    
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fsPromises.readdir as jest.Mock).mockResolvedValue(["frame_001.png", "frame_002.png"]);
    (fsPromises.readFile as jest.Mock).mockResolvedValue(Buffer.from("fake_image_data"));

    const frames = await ScreenCapture.captureBurst(1, 2);

    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("ffmpeg -f gdigrab -framerate 2 -i desktop -t 1"),
      expect.any(Function)
    );
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
});
