import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const ALGORITHM = "aes-256-cbc";

export class CredentialVault {
  static VAULT_PATH = path.resolve(process.cwd(), "src/workspace/credentials.enc.json");

  private static getKey(): Buffer {
    const key = process.env.CREDENTIAL_VAULT_KEY ?? "midpointx-default-vault-key-change-me";
    return crypto.scryptSync(key, "midpointx-salt-v1", 32);
  }

  private static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
  }

  private static decrypt(encryptedText: string): string {
    const [ivHex, dataHex] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, this.getKey(), iv);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  private static async readVault(): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(this.VAULT_PATH, "utf8");
      const parsed = JSON.parse(content);
      const decrypted: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        try { decrypted[k] = this.decrypt(v as string); } catch { /* skip corrupted */ }
      }
      return decrypted;
    } catch { return {}; }
  }

  private static async writeVault(data: Record<string, string>): Promise<void> {
    const encrypted: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      encrypted[k] = this.encrypt(v);
    }
    await fs.mkdir(path.dirname(this.VAULT_PATH), { recursive: true });
    await fs.writeFile(this.VAULT_PATH, JSON.stringify(encrypted, null, 2), "utf8");
  }

  static async store(connectorId: string, credentials: Record<string, string>): Promise<void> {
    const vault = await this.readVault();
    vault[connectorId] = JSON.stringify(credentials);
    await this.writeVault(vault);
  }

  static async retrieve(connectorId: string): Promise<Record<string, string> | null> {
    const vault = await this.readVault();
    const entry = vault[connectorId];
    if (!entry) return null;
    return JSON.parse(entry);
  }

  static async delete(connectorId: string): Promise<void> {
    const vault = await this.readVault();
    delete vault[connectorId];
    await this.writeVault(vault);
  }

  static async listIds(): Promise<string[]> {
    const vault = await this.readVault();
    return Object.keys(vault);
  }
}
