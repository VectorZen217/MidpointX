import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";

export class YahooFinanceConnector implements IConnector {
  readonly id = "yahoo-finance";
  readonly name = "Yahoo Finance";
  readonly category: ConnectorCategory = "finance";
  readonly authType: AuthType = "none";
  readonly configFields: ConnectorConfigField[] = [];
  private connected = false;

  async connect(_credentials: Record<string, string>): Promise<void> {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) throw new Error("Yahoo Finance API unreachable");
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d", {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      return res.ok;
    } catch { return false; }
  }

  getTools(): ConnectorTool[] {
    return [
      {
        name: "get_price",
        description: "Get the current market price for a stock symbol (e.g., AAPL, TSLA, MSFT)",
        inputSchema: {
          type: "object",
          properties: { symbol: { type: "string", description: "Stock ticker symbol e.g. AAPL" } },
          required: ["symbol"]
        },
        execute: async (args) => {
          const symbol = String(args.symbol).toUpperCase();
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`);
          const data = await res.json() as any;
          const meta = data?.chart?.result?.[0]?.meta;
          if (!meta) throw new Error(`No data for symbol ${symbol}`);
          return {
            symbol,
            price: meta.regularMarketPrice,
            previousClose: meta.previousClose,
            change: +(meta.regularMarketPrice - meta.previousClose).toFixed(2),
            changePercent: +(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100).toFixed(2),
            currency: meta.currency,
            marketState: meta.marketState
          };
        }
      },
      {
        name: "get_watchlist",
        description: "Get current prices for multiple stock symbols at once",
        inputSchema: {
          type: "object",
          properties: {
            symbols: { type: "array", items: { type: "string" }, description: 'Array of ticker symbols e.g. ["AAPL","TSLA"]' }
          },
          required: ["symbols"]
        },
        execute: async (args) => {
          const symbols = (args.symbols as string[]).map(s => s.toUpperCase());
          return Promise.all(symbols.map(async (symbol) => {
            try {
              const res = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
                { headers: { "User-Agent": "Mozilla/5.0" } }
              );
              if (!res.ok) return { symbol, error: `HTTP ${res.status}` };
              const data = await res.json() as any;
              const meta = data?.chart?.result?.[0]?.meta;
              if (!meta) return { symbol, error: "No data" };
              return {
                symbol,
                price: meta.regularMarketPrice,
                change: +(meta.regularMarketPrice - meta.previousClose).toFixed(2),
                changePercent: +(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100).toFixed(2)
              };
            } catch (e: any) { return { symbol, error: e.message }; }
          }));
        }
      },
      {
        name: "get_news",
        description: "Get recent financial news headlines for a stock symbol",
        inputSchema: {
          type: "object",
          properties: { symbol: { type: "string", description: "Stock ticker symbol" } },
          required: ["symbol"]
        },
        execute: async (args) => {
          const symbol = String(args.symbol).toUpperCase();
          const res = await fetch(
            `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=5&quotesCount=0`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          if (!res.ok) throw new Error(`Yahoo Finance news returned ${res.status}`);
          const data = await res.json() as any;
          return (data?.news ?? []).slice(0, 5).map((n: any) => ({
            title: n.title,
            publisher: n.publisher,
            link: n.link,
            published: new Date(n.providerPublishTime * 1000).toISOString()
          }));
        }
      }
    ];
  }
}
