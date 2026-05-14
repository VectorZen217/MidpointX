import * as os from "os";
import * as fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class EnvironmentProbe {
  private static async getBinaryPath(binaryName: string, isWindows: boolean): Promise<string | null> {
    try {
      const cmd = isWindows ? "where" : "which";
      // Execute securely since arguments are passed as an array to prevent injection
      const { stdout } = await execFileAsync(cmd, [binaryName], { encoding: "utf8" });
      // Clean up whitespace and handle multiple results from Windows 'where' (take first)
      const lines = stdout.trim().split("\n");
      return lines.length > 0 && lines[0].trim().length > 0 ? lines[0].trim() : null;
    } catch {
      return null;
    }
  }

  public static async scan() {
    const isWindows = os.platform() === "win32";

    // 1. Hardware and OS
    const host = {
      os: os.platform(),
      architecture: os.arch(),
      memory_gb: Math.round(os.totalmem() / (1024 * 1024 * 1024))
    };

    // 2. Tool Discovery
    const targets = [
      "gcloud", "git", "docker", "python", "npm", 
      "node", "curl", "wget", "powershell", "bash", 
      "pip", "python3", "chrome", "msedge", "firefox"
    ];
    
    const binaries: Record<string, string | null> = {};
    await Promise.all(
      targets.map(async (target) => {
        binaries[target] = await this.getBinaryPath(target, isWindows);
      })
    );

    // 2.1 Browser Specific Paths (Windows defaults)
    if (isWindows) {
        if (!binaries["chrome"]) {
            const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
            if (fs.existsSync(chromePath)) binaries["chrome"] = chromePath;
        }
        if (!binaries["msedge"]) {
            const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
            if (fs.existsSync(edgePath)) binaries["msedge"] = edgePath;
        }
        if (!binaries["firefox"]) {
            const ffPath = "C:\\Program Files\\Mozilla Firefox\\firefox.exe";
            if (fs.existsSync(ffPath)) binaries["firefox"] = ffPath;
        }
    }

    const capabilities = {
      shell: isWindows ? "powershell" : "bash", // assumed default fallback
      binaries: binaries
    };

    // 3. Permission and Path Audit
    const cwd = process.cwd();
    let canWrite = false;
    try {
      fs.accessSync(cwd, fs.constants.W_OK);
      canWrite = true;
    } catch {
      canWrite = false;
    }

    const environment = {
      project_root: cwd,
      write_access: canWrite,
      identity: process.env.USERNAME || process.env.USER || "Unknown",
      mode: process.env.NODE_ENV || "production"
    };

    return {
      host,
      capabilities,
      environment
    };
  }
}
