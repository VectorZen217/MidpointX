import * as fs from "fs/promises";
import * as path from "path";

const CORE_PATHS = ["src/core", "src/nodes", "src/server.ts"].map(p => path.resolve(process.cwd(), p));

export class FileSystemController {
  private static checkImmutableCore(targetPath: string) {
    const isCore = CORE_PATHS.some(corePath => targetPath.startsWith(corePath));
    if (isCore) {
      throw new Error(`Permission Denied: Immutable Core Guard. You are attempting to modify a core file (${targetPath}). If this refactor is intentional, please tell the user why and what you are changing, and ask them to temporarily disable this guard if approved.`);
    }
  }
  static async listDirectory(targetPath: string) {
    try {
      const p = path.resolve(targetPath);
      const items = await fs.readdir(p, { withFileTypes: true });
      return items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? "dir" : "file"
      }));
    } catch(e: any) {
      throw new Error(`Failed to list directory: ${e.message}`);
    }
  }

  static async readFileContent(filePath: string) {
    try {
        const p = path.resolve(filePath);
        return await fs.readFile(p, 'utf-8');
    } catch(e: any) {
        throw new Error(`Failed to read file: ${e.message}`);
    }
  }

  static async writeFileContent(filePath: string, content: string) {
    try {
        const p = path.resolve(filePath);
        this.checkImmutableCore(p);
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, content, 'utf-8');
        return "File successfully written.";
    } catch(e: any) {
        throw new Error(`Failed to write file: ${e.message}`);
    }
  }

  static async deleteFile(filePath: string) {
    try {
        const p = path.resolve(filePath);
        this.checkImmutableCore(p);
        await fs.unlink(p);
        return "File successfully deleted.";
    } catch(e: any) {
        throw new Error(`Failed to delete file: ${e.message}`);
    }
  }
  
  static async exists(targetPath: string) {
    try {
        const p = path.resolve(targetPath);
        await fs.stat(p);
        return { exists: true, path: p };
    } catch {
        return { exists: false, path: path.resolve(targetPath) };
    }
  }

  static async searchFiles(rootPath: string, pattern: string): Promise<string[]> {
    const results: string[] = [];
    async function walk(dir: string) {
      const files = await fs.readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          await walk(fullPath);
        } else if (file.isFile() && file.name.includes(pattern)) {
          results.push(fullPath);
        }
      }
    }
    try {
      await walk(path.resolve(rootPath));
      return results;
    } catch (e: any) {
      throw new Error(`Failed to search files: ${e.message}`);
    }
  }
}
