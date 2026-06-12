import { YahooFinanceConnector } from "../plugins/connectors/yahooFinanceConnector";

const connector = new YahooFinanceConnector();

beforeEach(() => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: 150.25,
            previousClose: 148.00,
            currency: "USD",
            marketState: "REGULAR"
          }
        }]
      }
    })
  } as any);
});

afterEach(() => jest.restoreAllMocks());

describe("YahooFinanceConnector", () => {
  it("has correct id, category, authType", () => {
    expect(connector.id).toBe("yahoo-finance");
    expect(connector.category).toBe("finance");
    expect(connector.authType).toBe("none");
  });

  it("connect() resolves without error when API responds ok", async () => {
    await expect(connector.connect({})).resolves.not.toThrow();
  });

  it("get_price tool returns price and change", async () => {
    await connector.connect({});
    const tools = connector.getTools();
    const getPriceTool = tools.find(t => t.name === "get_price")!;
    const result = await getPriceTool.execute({ symbol: "AAPL" }) as any;
    expect(result.symbol).toBe("AAPL");
    expect(result.price).toBe(150.25);
    expect(result.change).toBe(2.25);
  });

  it("healthCheck returns true when API is reachable", async () => {
    await connector.connect({});
    const healthy = await connector.healthCheck();
    expect(healthy).toBe(true);
  });

  it("healthCheck returns false when fetch throws", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network error"));
    const healthy = await connector.healthCheck();
    expect(healthy).toBe(false);
  });

  it("exposes get_price, get_watchlist, and get_news tools", () => {
    const names = connector.getTools().map(t => t.name);
    expect(names).toContain("get_price");
    expect(names).toContain("get_watchlist");
    expect(names).toContain("get_news");
  });
});
