import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";

export class AlphaVantageConnector implements IConnector {
  readonly id = "alpha-vantage";
  readonly name = "Alpha Vantage";
  readonly category: ConnectorCategory = "finance";
  readonly authType: AuthType = "apikey";
  readonly configFields: ConnectorConfigField[] = [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "Get free key at alphavantage.co" }
  ];
  private apiKey = "";
  private readonly baseUrl = "https://www.alphavantage.co/query";

  async connect(credentials: Record<string, string>): Promise<void> {
    this.apiKey = credentials.apiKey;
    const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${this.apiKey}`);
    if (!res.ok) throw new Error("Alpha Vantage API unreachable");
    const data = await res.json() as any;
    if (data["Note"] || data["Information"]) throw new Error("Alpha Vantage: rate limit hit or invalid API key");
  }

  async disconnect(): Promise<void> { this.apiKey = ""; }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${this.apiKey}`);
      if (!res.ok) return false;
      const data = await res.json() as any;
      return !data["Note"] && !data["Information"];
    } catch { return false; }
  }

  getTools(): ConnectorTool[] {
    return [
      {
        name: "get_price",
        description: "Get real-time stock quote from Alpha Vantage. More reliable than Yahoo Finance for production use.",
        inputSchema: {
          type: "object",
          properties: { symbol: { type: "string", description: "Stock ticker e.g. AAPL" } },
          required: ["symbol"]
        },
        execute: async (args) => {
          const symbol = String(args.symbol).toUpperCase();
          const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`);
          if (!res.ok) throw new Error(`Alpha Vantage returned ${res.status}`);
          const data = await res.json() as any;
          const q = data["Global Quote"];
          if (!q?.["05. price"]) throw new Error(`No quote data for ${symbol}`);
          return {
            symbol,
            price: parseFloat(q["05. price"]),
            change: parseFloat(q["09. change"]),
            changePercent: q["10. change percent"],
            open: parseFloat(q["02. open"]),
            high: parseFloat(q["03. high"]),
            low: parseFloat(q["04. low"]),
            volume: parseInt(q["06. volume"], 10)
          };
        }
      },
      {
        name: "get_portfolio_value",
        description: "Calculate total portfolio value from a list of symbol+quantity holdings",
        inputSchema: {
          type: "object",
          properties: {
            holdings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  symbol: { type: "string" },
                  quantity: { type: "number" }
                },
                required: ["symbol", "quantity"]
              },
              description: 'Array of {symbol, quantity} e.g. [{"symbol":"AAPL","quantity":10}]'
            }
          },
          required: ["holdings"]
        },
        execute: async (args) => {
          const holdings = args.holdings as Array<{ symbol: string; quantity: number }>;
          let totalValue = 0;
          const positions = [];
          for (const h of holdings) {
            const symbol = h.symbol.toUpperCase();
            const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`);
            const data = await res.json() as any;
            const price = parseFloat(data["Global Quote"]?.["05. price"] ?? "0");
            const value = price * h.quantity;
            totalValue += value;
            positions.push({ symbol, quantity: h.quantity, price, value: +value.toFixed(2) });
          }
          return { totalValue: +totalValue.toFixed(2), positions };
        }
      }
    ];
  }
}
