import fs from "fs/promises";
import path from "path";

/**
 * EnvManager
 * Safely reads and writes the .env file while preserving as much structure as possible.
 */
export class EnvManager {
  private static envPath = path.resolve(process.cwd(), ".env");

  /**
   * Reads the current .env file and returns a key-value map.
   */
  static async readEnv(): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(this.envPath, "utf-8");
      const lines = content.split("\n");
      const env: Record<string, string> = {};

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [key, ...rest] = trimmed.split("=");
          let value = rest.join("=").trim();
          
          // Strip inline comments if they exist (handling cases where # might be inside quotes)
          // Simplified: if there's a # not inside quotes, strip from there
          let cleanValue = value;
          const hashIndex = value.indexOf("#");
          if (hashIndex !== -1) {
            // Check if # is inside quotes (very basic check)
            const firstQuote = value.indexOf('"');
            const lastQuote = value.lastIndexOf('"');
            if (!(firstQuote !== -1 && lastQuote !== -1 && hashIndex > firstQuote && hashIndex < lastQuote)) {
              cleanValue = value.substring(0, hashIndex).trim();
            }
          }
          
          // Remove quotes if present
          if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) || (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
            cleanValue = cleanValue.substring(1, cleanValue.length - 1);
          }
          
          env[key.trim()] = cleanValue;
        }
      }
      return env;
    } catch (error) {
      console.warn("⚠️ [EnvManager] No .env file found. Returning empty config.");
      return {};
    }
  }

  /**
   * Updates the .env file with new values.
   * If a key exists, its value is replaced.
   * If it doesn't exist, it's appended.
   */
  static async updateEnv(updates: Record<string, string>): Promise<void> {
    let content = "";
    try {
      content = await fs.readFile(this.envPath, "utf-8");
    } catch {
      // Create new if missing
    }

    const lines = content.split("\n");
    const updatedLines: string[] = [];
    const keysToUpdate = new Set(Object.keys(updates));

    for (let line of lines) {
      const trimmed = line.trim();
      let handled = false;

      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key] = trimmed.split("=");
        const cleanKey = key.trim();
        
        if (keysToUpdate.has(cleanKey)) {
          const newValue = updates[cleanKey];
          updatedLines.push(`${cleanKey}="${newValue}"`);
          keysToUpdate.delete(cleanKey);
          handled = true;
        }
      }

      if (!handled) {
        updatedLines.push(line);
      }
    }

    // Append remaining new keys
    for (const key of keysToUpdate) {
      updatedLines.push(`${key}="${updates[key]}"`);
    }

    await fs.writeFile(this.envPath, updatedLines.join("\n"), "utf-8");
  }
}
