import { invokeWithResilience } from "../core/resilience";

describe("Resilience", () => {
  it("should successfully invoke a model and return its result", async () => {
    const mockModel = {
      invoke: jest.fn().mockResolvedValue("success")
    };
    
    const result = await invokeWithResilience(mockModel as any, []);
    expect(result).toBe("success");
    expect(mockModel.invoke).toHaveBeenCalledTimes(1);
  });

  it("should retry on transient errors and eventually succeed", async () => {
    const mockModel = {
      invoke: jest.fn()
        .mockRejectedValueOnce(new Error("Transient Error"))
        .mockResolvedValueOnce("success")
    };
    
    const result = await invokeWithResilience(mockModel as any, []);
    expect(result).toBe("success");
    expect(mockModel.invoke).toHaveBeenCalledTimes(2);
  }, 10000);

  it("should abort immediately on deterministic HTTP 400 error", async () => {
    const mockModel = {
      invoke: jest.fn().mockRejectedValue({ status: 400, message: "Bad Request" })
    };
    
    await expect(invokeWithResilience(mockModel as any, [])).rejects.toThrow("Deterministic failure (HTTP 400)");
    expect(mockModel.invoke).toHaveBeenCalledTimes(1);
  });
});
