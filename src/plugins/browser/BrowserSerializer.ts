import fs from "fs";
import path from "path";

export interface BrowserSessionState {
  url: string;
  cookies: any[];
  localStorage: string | null;
  sessionStorage: string | null;
  domSnapshot: string;
  timestamp: string;
}

export class BrowserSerializer {
  private static getSessionsDir(): string {
    const dir = path.join(process.cwd(), "src", "workspace", "sessions");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Serializes the current active Puppeteer page context to a persistent JSON state file.
   */
  static async serializeSession(page: any, taskId: string): Promise<string> {
    try {
      console.log(`🌐 [BrowserSerializer] Serializing active browser session for task: ${taskId}...`);
      
      const url = page.url();
      const cookies = await page.cookies();
      
      const storage = await page.evaluate(() => {
        return {
          local: JSON.stringify(localStorage),
          session: JSON.stringify(sessionStorage)
        };
      }).catch(() => ({ local: null, session: null }));

      const domSnapshot = await page.content().catch(() => "");

      const sessionState: BrowserSessionState = {
        url,
        cookies,
        localStorage: storage.local,
        sessionStorage: storage.session,
        domSnapshot,
        timestamp: new Date().toISOString()
      };

      const sessionFile = path.join(this.getSessionsDir(), `browser_${taskId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(sessionState, null, 2), "utf8");
      
      console.log(`💾 [BrowserSerializer] Session serialized successfully to: ${sessionFile}`);
      return sessionFile;
    } catch (err: any) {
      console.error("❌ [BrowserSerializer] Serialization failed:", err.message);
      throw err;
    }
  }

  /**
   * Rehydrates a persistent session state back into a newly spawned Puppeteer tab.
   */
  static async rehydrateSession(browser: any, taskId: string): Promise<any> {
    try {
      const sessionFile = path.join(this.getSessionsDir(), `browser_${taskId}.json`);
      if (!fs.existsSync(sessionFile)) {
        console.warn(`⚠️ [BrowserSerializer] No serialized session found for task: ${taskId}. Opening blank tab.`);
        return await browser.newPage();
      }

      console.log(`🌐 [BrowserSerializer] Rehydrating browser session from: ${sessionFile}...`);
      const raw = fs.readFileSync(sessionFile, "utf8");
      const state = JSON.parse(raw) as BrowserSessionState;

      const page = await browser.newPage();

      // 1. Set all saved cookies
      if (state.cookies && state.cookies.length > 0) {
        await page.setCookie(...state.cookies);
      }

      // 2. Navigate to the saved URL
      await page.goto(state.url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // 3. Inject localStorage and sessionStorage tokens
      await page.evaluate(({ local, session }: { local: string | null, session: string | null }) => {
        if (local) {
          try {
            const parsed = JSON.parse(local);
            for (const [k, v] of Object.entries(parsed)) {
              localStorage.setItem(k, v as string);
            }
          } catch (e) {}
        }
        if (session) {
          try {
            const parsed = JSON.parse(session);
            for (const [k, v] of Object.entries(parsed)) {
              sessionStorage.setItem(k, v as string);
            }
          } catch (e) {}
        }
      }, { local: state.localStorage, session: state.sessionStorage });

      // 4. Reload page to trigger state application
      await page.reload({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});

      console.log(`✅ [BrowserSerializer] Session rehydrated successfully onto page: ${state.url}`);
      return page;
    } catch (err: any) {
      console.error("❌ [BrowserSerializer] Rehydration failed:", err.message);
      throw err;
    }
  }

  /**
   * Utility to spawn a visible Chrome/Chromium browser adhering to the User preference: { headless: false }
   */
  static async launchVisibleBrowser(): Promise<any> {
    const puppeteer = require("puppeteer");
    console.log("🌐 [BrowserSerializer] Spawning browser in VISIBLE mode (headless: false)...");
    return await puppeteer.launch({
      headless: false,
      args: [
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    });
  }
}
