import path from "path";
import fs from "fs/promises";

const TEST_VAULT = path.resolve(process.cwd(), "src/workspace/credentials.test.enc.json");

// Must set env before requiring the module
process.env.CREDENTIAL_VAULT_KEY = "test-vault-key-minimum-32-characters!!";

import { CredentialVault } from "../core/credentialVault";

beforeAll(async () => {
  // Override vault path for tests
  (CredentialVault as any).VAULT_PATH = TEST_VAULT;
});

afterAll(async () => {
  try { await fs.unlink(TEST_VAULT); } catch {}
});

beforeEach(async () => {
  // Clean vault before each test
  try { await fs.unlink(TEST_VAULT); } catch {}
});

describe("CredentialVault", () => {
  it("stores and retrieves credentials for a connector", async () => {
    await CredentialVault.store("test-connector", { apiKey: "secret-123" });
    const result = await CredentialVault.retrieve("test-connector");
    expect(result).toEqual({ apiKey: "secret-123" });
  });

  it("returns null for unknown connector", async () => {
    const result = await CredentialVault.retrieve("nonexistent");
    expect(result).toBeNull();
  });

  it("deletes credentials", async () => {
    await CredentialVault.store("to-delete", { token: "abc" });
    await CredentialVault.delete("to-delete");
    const result = await CredentialVault.retrieve("to-delete");
    expect(result).toBeNull();
  });

  it("lists stored connector IDs", async () => {
    await CredentialVault.store("conn-a", { key: "1" });
    await CredentialVault.store("conn-b", { key: "2" });
    const ids = await CredentialVault.listIds();
    expect(ids).toContain("conn-a");
    expect(ids).toContain("conn-b");
  });

  it("stores credentials encrypted (file should not contain plaintext)", async () => {
    await CredentialVault.store("secret-connector", { password: "hunter2" });
    const raw = await fs.readFile(TEST_VAULT, "utf8");
    expect(raw).not.toContain("hunter2");
  });
});
