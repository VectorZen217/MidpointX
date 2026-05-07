import * as fs from "fs/promises";
import * as path from "path";

export class FileSystemController {
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
        await fs.unlink(p);
        return "File successfully deleted.";
    } catch(e: any) {
        throw new Error(`Failed to delete file: ${e.message}`);
    }
  }
}
