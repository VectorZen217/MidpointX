import { EnvironmentProbe } from "../core/environmentProbe";
import * as os from "os";

describe("EnvironmentProbe", () => {
  it("should successfully scan the environment and return host capabilities", async () => {
    const report = await EnvironmentProbe.scan();
    
    expect(report).toBeDefined();
    expect(report.host).toBeDefined();
    expect(report.capabilities).toBeDefined();
    expect(report.environment).toBeDefined();
    
    expect(report.host.os).toBe(os.platform());
    expect(report.host.architecture).toBe(os.arch());
    
    // Check that at least some binaries were checked
    expect(Object.keys(report.capabilities.binaries).length).toBeGreaterThan(0);
    
    expect(report.environment.project_root).toBeDefined();
    expect(typeof report.environment.write_access).toBe("boolean");
  }, 20000);
});
