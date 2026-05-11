import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";
import { Firestore } from "@google-cloud/firestore";
import { Config } from "./config";

/**
 * PersistenceAdapter: Abstract interface for all MidpointX data storage.
 * Enables switching between local filesystem (Dev) and Google Cloud Firestore (Production).
 */
export interface PersistenceAdapter {
  // Memory Logs
  appendLog(category: string, key: string, content: string): Promise<void>;
  readLogs(category: string, key: string): Promise<string>;
  listLogs(category: string): Promise<string[]>;

  // Skill/Theorem Storage
  saveSkill(name: string, content: string): Promise<void>;
  readSkill(name: string): Promise<string | null>;
  listSkills(): Promise<string[]>;

  // Metrics/Stats
  saveStats(key: string, data: any): Promise<void>;
  readStats(key: string): Promise<any>;

  // Audit Ledger
  appendAudit(entry: string): Promise<void>;
  getLatestAuditHash(): Promise<string>;

  // Session Management (Phase 6)
  saveSession(session: any): Promise<void>;
  getSession(taskId: string): Promise<any | null>;
  listActiveSessions(): Promise<string[]>;

  // Advanced Operations (Cleanup/Consolidation)
  searchLogs(category: string, queryTerms: string[]): Promise<Array<{ date: string; entry: string; score: number }>>;
  deleteLog(category: string, key: string): Promise<void>;
  moveSkill(source: string, destination: string): Promise<void>;
  listLogFiles(category: string): Promise<string[]>;
}

/**
 * Local implementation using the Node.js filesystem.
 */
export class LocalPersistenceAdapter implements PersistenceAdapter {
  private baseDir = path.resolve(__dirname, "../../src/workspace");
  private sessions: Map<string, any> = new Map();

  async appendLog(category: string, key: string, content: string): Promise<void> {
    const dir = path.join(this.baseDir, category);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, `${key}.md`), content, "utf-8");
  }

  async readLogs(category: string, key: string): Promise<string> {
    const filePath = path.join(this.baseDir, category, `${key}.md`);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  async listLogs(category: string): Promise<string[]> {
    const dir = path.join(this.baseDir, category);
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  async saveSkill(name: string, content: string): Promise<void> {
    const skillDir = path.resolve(__dirname, "../../src/plugins/skills");
    await fs.writeFile(path.join(skillDir, `${name}.md`), content, "utf-8");
  }

  async readSkill(name: string): Promise<string | null> {
    const skillDir = path.resolve(__dirname, "../../src/plugins/skills");
    try {
      return await fs.readFile(path.join(skillDir, `${name}.md`), "utf-8");
    } catch {
      return null;
    }
  }

  async listSkills(): Promise<string[]> {
    const skillDir = path.resolve(__dirname, "../../src/plugins/skills");
    try {
      return await fs.readdir(skillDir);
    } catch {
      return [];
    }
  }

  async saveStats(key: string, data: any): Promise<void> {
    const statsPath = path.resolve(__dirname, `../../src/plugins/skills/${key}.json`);
    await fs.writeFile(statsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async readStats(key: string): Promise<any> {
    const statsPath = path.resolve(__dirname, `../../src/plugins/skills/${key}.json`);
    try {
      const data = await fs.readFile(statsPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async appendAudit(entry: string): Promise<void> {
    const auditDir = path.resolve(__dirname, "../../logs/audit");
    if (!existsSync(auditDir)) await fs.mkdir(auditDir, { recursive: true });
    await fs.appendFile(path.join(auditDir, "a2a_handshake.jsonl"), entry + "\n");
  }

  async getLatestAuditHash(): Promise<string> {
    const auditDir = path.resolve(__dirname, "../../logs/audit");
    const logPath = path.join(auditDir, "a2a_handshake.jsonl");
    if (!existsSync(logPath)) return "0";

    const content = (await fs.readFile(logPath, "utf-8")).trim().split("\n");
    if (content.length === 0) return "0";

    try {
      const lastEntry = JSON.parse(content[content.length - 1]);
      return lastEntry.hash || "0";
    } catch {
      return "CORRUPT";
    }
  }

  async searchLogs(category: string, queryTerms: string[]): Promise<Array<{ date: string; entry: string; score: number }>> {
    const dir = path.join(this.baseDir, category);
    if (!existsSync(dir)) return [];

    const files = await fs.readdir(dir);
    const results: Array<{ date: string; entry: string; score: number }> = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const content = await fs.readFile(path.join(dir, file), "utf-8");
      const date = file.replace(".md", "");

      // Split by entry blocks (## [...] headers)
      const entries = content.split(/\n(?=## \[)|^(?=## \[)/m).filter(e => e.trim().length > 10);

      for (const entry of entries) {
        const entryLower = entry.toLowerCase();
        const score = queryTerms.reduce((acc, term) => acc + (entryLower.includes(term) ? 1 : 0), 0);
        if (score > 0) {
          results.push({ date, entry: entry.trim(), score });
        }
      }
    }
    return results;
  }

  async deleteLog(category: string, key: string): Promise<void> {
    const filePath = path.join(this.baseDir, category, `${key}.md`);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  }

  async moveSkill(source: string, destination: string): Promise<void> {
    const skillDir = path.resolve(__dirname, "../../src/plugins/skills");
    const srcPath = path.join(skillDir, source);
    const destPath = path.join(skillDir, destination);
    if (existsSync(srcPath)) {
      await fs.rename(srcPath, destPath);
    }
  }

  async listLogFiles(category: string): Promise<string[]> {
    const dir = path.join(this.baseDir, category);
    if (!existsSync(dir)) return [];
    return await fs.readdir(dir);
  }

  async saveSession(session: any): Promise<void> {
    this.sessions.set(session.taskId, session);
    const sessionDir = path.join(this.baseDir, "sessions");
    if (!existsSync(sessionDir)) await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, `${session.taskId}.json`), JSON.stringify(session, null, 2));
  }

  async getSession(taskId: string): Promise<any | null> {
    const session = this.sessions.get(taskId);
    if (session) return session;

    const sessionFile = path.join(this.baseDir, "sessions", `${taskId}.json`);
    if (existsSync(sessionFile)) {
      const data = await fs.readFile(sessionFile, "utf-8");
      return JSON.parse(data);
    }
    return null;
  }

  async listActiveSessions(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }
}

/**
 * Firestore implementation for Production Cloud Deployment.
 */
export class FirestorePersistenceAdapter implements PersistenceAdapter {
  private db: Firestore;

  constructor() {
    this.db = new Firestore({
      projectId: Config.GCP_PROJECT_ID,
    });
  }

  async appendLog(category: string, key: string, content: string): Promise<void> {
    const docRef = this.db.collection("logs").doc(`${category}_${key}`);
    await docRef.set({
      content: (await this.readLogs(category, key)) + content,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }

  async readLogs(category: string, key: string): Promise<string> {
    const doc = await this.db.collection("logs").doc(`${category}_${key}`).get();
    return doc.exists ? doc.data()?.content || "" : "";
  }

  async listLogs(category: string): Promise<string[]> {
    const snapshot = await this.db.collection("logs").where("category", "==", category).get();
    return snapshot.docs.map(doc => doc.id);
  }

  async saveSkill(name: string, content: string): Promise<void> {
    await this.db.collection("skills").doc(name).set({
      content,
      updatedAt: new Date().toISOString()
    });
  }

  async readSkill(name: string): Promise<string | null> {
    const doc = await this.db.collection("skills").doc(name).get();
    return doc.exists ? doc.data()?.content || null : null;
  }

  async listSkills(): Promise<string[]> {
    const snapshot = await this.db.collection("skills").get();
    return snapshot.docs.map(doc => doc.id);
  }

  async saveStats(key: string, data: any): Promise<void> {
    await this.db.collection("stats").doc(key).set(data);
  }

  async readStats(key: string): Promise<any> {
    const doc = await this.db.collection("stats").doc(key).get();
    return doc.exists ? doc.data() : {};
  }

  async appendAudit(entry: string): Promise<void> {
    const data = JSON.parse(entry);
    await this.db.collection("audit").add({
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    });
  }

  async getLatestAuditHash(): Promise<string> {
    const snapshot = await this.db.collection("audit")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();
    
    if (snapshot.empty) return "0";
    return snapshot.docs[0].data().hash || "0";
  }

  async saveSession(session: any): Promise<void> {
    await this.db.collection("sessions").doc(session.taskId).set({
      ...session,
      updatedAt: new Date().toISOString()
    });
  }

  async getSession(taskId: string): Promise<any | null> {
    const doc = await this.db.collection("sessions").doc(taskId).get();
    return doc.exists ? doc.data() : null;
  }

  async listActiveSessions(): Promise<string[]> {
    const snapshot = await this.db.collection("sessions").get();
    return snapshot.docs.map(doc => doc.id);
  }

  async searchLogs(category: string, queryTerms: string[]): Promise<Array<{ date: string; entry: string; score: number }>> {
    // Basic Firestore implementation: fetch all and filter client-side (Simplified for MVP)
    // Production note: For true search, integrate with Vertex AI Vector Search
    const snapshot = await this.db.collection("logs").get();
    const results: Array<{ date: string; entry: string; score: number }> = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const content = data.content || "";
      const date = doc.id.replace(`${category}_`, "");
      
      const entries = content.split(/\n(?=## \[)|^(?=## \[)/m).filter((e: string) => e.trim().length > 10);
      for (const entry of entries) {
        const entryLower = entry.toLowerCase();
        const score = queryTerms.reduce((acc, term) => acc + (entryLower.includes(term) ? 1 : 0), 0);
        if (score > 0) {
          results.push({ date, entry: entry.trim(), score });
        }
      }
    }
    return results;
  }

  async deleteLog(category: string, key: string): Promise<void> {
    await this.db.collection("logs").doc(`${category}_${key}`).delete();
  }

  async moveSkill(source: string, destination: string): Promise<void> {
    const skill = await this.readSkill(source);
    if (skill) {
      await this.saveSkill(destination, skill);
      await this.db.collection("skills").doc(source).delete();
    }
  }

  async listLogFiles(category: string): Promise<string[]> {
    return this.listLogs(category);
  }
}

/**
 * Factory for retrieving the active persistence adapter.
 */
export class PersistenceFactory {
  private static instance: PersistenceAdapter | null = null;

  static getAdapter(): PersistenceAdapter {
    if (this.instance) return this.instance;
    
    if (Config.PERSISTENCE_ADAPTER === "firestore") {
      console.log("☁️ [Persistence] Initializing FirestorePersistenceAdapter...");
      this.instance = new FirestorePersistenceAdapter();
    } else {
      console.log("📂 [Persistence] Initializing LocalPersistenceAdapter...");
      this.instance = new LocalPersistenceAdapter();
    }
    
    return this.instance;
  }
}
