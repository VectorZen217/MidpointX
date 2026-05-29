import * as fs from "fs/promises";
import * as path from "path";
import { SchedulerRegistry } from "../src/core/schedulerRegistry";

const TEST_REGISTRY = path.join(__dirname, "../temp/test_scheduler_registry.json");

beforeEach(async () => {
  await fs.mkdir(path.dirname(TEST_REGISTRY), { recursive: true });
  await fs.writeFile(TEST_REGISTRY, "{}", "utf-8");
});

afterEach(async () => {
  await fs.rm(TEST_REGISTRY, { force: true });
});

describe("SchedulerRegistry", () => {
  it("saves and reads a schedule entry", async () => {
    const reg = new SchedulerRegistry(TEST_REGISTRY);
    await reg.set("my-skill", { schedule: "0 9 * * *", enabled: true });
    const entry = await reg.get("my-skill");
    expect(entry?.schedule).toBe("0 9 * * *");
    expect(entry?.enabled).toBe(true);
  });

  it("toggle disables an enabled entry", async () => {
    const reg = new SchedulerRegistry(TEST_REGISTRY);
    await reg.set("my-skill", { schedule: "0 9 * * *", enabled: true });
    await reg.toggle("my-skill", false);
    const entry = await reg.get("my-skill");
    expect(entry?.enabled).toBe(false);
  });

  it("toggle throws when entry does not exist", async () => {
    const reg = new SchedulerRegistry(TEST_REGISTRY);
    await expect(reg.toggle("nonexistent", true)).rejects.toThrow("Scheduler entry not found");
  });

  it("listEnabled returns only enabled entries", async () => {
    const reg = new SchedulerRegistry(TEST_REGISTRY);
    await reg.set("skill-a", { schedule: "0 9 * * *", enabled: true });
    await reg.set("skill-b", { schedule: "0 10 * * *", enabled: false });
    const active = await reg.listEnabled();
    expect(active).toHaveLength(1);
    expect(active[0].slug).toBe("skill-a");
  });

  it("listAll returns all entries regardless of enabled state", async () => {
    const reg = new SchedulerRegistry(TEST_REGISTRY);
    await reg.set("skill-a", { schedule: "0 9 * * *", enabled: true });
    await reg.set("skill-b", { schedule: "0 10 * * *", enabled: false });
    const all = await reg.listAll();
    expect(all).toHaveLength(2);
  });

  it("delete removes an entry", async () => {
    const reg = new SchedulerRegistry(TEST_REGISTRY);
    await reg.set("my-skill", { schedule: "0 9 * * *", enabled: true });
    await reg.delete("my-skill");
    const entry = await reg.get("my-skill");
    expect(entry).toBeUndefined();
  });

  it("returns empty object when registry file does not exist", async () => {
    await fs.rm(TEST_REGISTRY, { force: true });
    const reg = new SchedulerRegistry(TEST_REGISTRY);
    const all = await reg.listAll();
    expect(all).toEqual([]);
  });
});
