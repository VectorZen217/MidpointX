import * as fs from "fs/promises";
import * as path from "path";

export interface ScheduleEntry {
  schedule: string;
  enabled: boolean;
}

export interface ScheduleRecord extends ScheduleEntry {
  slug: string;
}

type RegistryData = Record<string, ScheduleEntry>;

const DEFAULT_REGISTRY_PATH = path.resolve(
  __dirname,
  "../../src/plugins/skills/scheduler-registry.json"
);

export class SchedulerRegistry {
  constructor(private registryPath: string = DEFAULT_REGISTRY_PATH) {}

  private async read(): Promise<RegistryData> {
    try {
      const raw = await fs.readFile(this.registryPath, "utf-8");
      return JSON.parse(raw) as RegistryData;
    } catch {
      return {};
    }
  }

  private async write(data: RegistryData): Promise<void> {
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(this.registryPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async get(slug: string): Promise<ScheduleEntry | undefined> {
    return (await this.read())[slug];
  }

  async set(slug: string, entry: ScheduleEntry): Promise<void> {
    const data = await this.read();
    data[slug] = entry;
    await this.write(data);
  }

  async toggle(slug: string, enabled: boolean): Promise<void> {
    const data = await this.read();
    if (!data[slug]) throw new Error(`Scheduler entry not found: ${slug}`);
    data[slug].enabled = enabled;
    await this.write(data);
  }

  async listEnabled(): Promise<ScheduleRecord[]> {
    const data = await this.read();
    return Object.entries(data)
      .filter(([, entry]) => entry.enabled)
      .map(([slug, entry]) => ({ slug, ...entry }));
  }

  async listAll(): Promise<ScheduleRecord[]> {
    const data = await this.read();
    return Object.entries(data).map(([slug, entry]) => ({ slug, ...entry }));
  }

  async delete(slug: string): Promise<void> {
    const data = await this.read();
    delete data[slug];
    await this.write(data);
  }
}

export const globalSchedulerRegistry = new SchedulerRegistry();
