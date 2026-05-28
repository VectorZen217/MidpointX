describe("PowerShell -EncodedCommand encoding", () => {
  it("round-trips a command containing double-quotes", () => {
    const cmd = 'Write-Output "hello world"';
    const wrappedCmd = `$ProgressPreference = 'SilentlyContinue'; ${cmd}`;
    const encoded = Buffer.from(wrappedCmd, "utf16le").toString("base64");
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toBe(wrappedCmd);
  });

  it("round-trips a command containing single-quotes and backticks", () => {
    const cmd = "Write-Host `$env:COMPUTERNAME; echo 'done'";
    const wrappedCmd = `$ProgressPreference = 'SilentlyContinue'; ${cmd}`;
    const encoded = Buffer.from(wrappedCmd, "utf16le").toString("base64");
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toBe(wrappedCmd);
  });
});

describe("fetchUrl escaping for PowerShell single-quoted strings", () => {
  function escapePsSingleQuotedString(s: string): string {
    return s.replace(/'/g, "''");
  }

  it("escapes a URL containing a single-quote", () => {
    const url = "https://example.com/it's-here";
    const escaped = escapePsSingleQuotedString(url);
    expect(escaped).toBe("https://example.com/it''s-here");
    const psStr = `Invoke-WebRequest -Uri '${escaped}'`;
    expect(psStr).toBe("Invoke-WebRequest -Uri 'https://example.com/it''s-here'");
  });

  it("leaves clean URLs unchanged", () => {
    const url = "https://example.com/search?q=foo+bar";
    expect(escapePsSingleQuotedString(url)).toBe(url);
  });
});
