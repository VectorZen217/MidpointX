import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";

export class OpenWeatherConnector implements IConnector {
  readonly id = "openweather";
  readonly name = "OpenWeather";
  readonly category: ConnectorCategory = "weather";
  readonly authType: AuthType = "apikey";
  readonly configFields: ConnectorConfigField[] = [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "Get free key at openweathermap.org" },
    { key: "defaultCity", label: "Default City", type: "text", placeholder: "e.g. New York" }
  ];
  private apiKey = "";
  private defaultCity = "New York";
  private readonly baseUrl = "https://api.openweathermap.org/data/2.5";

  async connect(credentials: Record<string, string>): Promise<void> {
    this.apiKey = credentials.apiKey;
    this.defaultCity = credentials.defaultCity || "New York";
    const res = await fetch(
      `${this.baseUrl}/weather?q=${encodeURIComponent(this.defaultCity)}&appid=${this.apiKey}&units=imperial`
    );
    if (!res.ok) throw new Error("OpenWeather: invalid API key or city not found");
  }

  async disconnect(): Promise<void> { this.apiKey = ""; }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}/weather?q=${encodeURIComponent(this.defaultCity)}&appid=${this.apiKey}&units=imperial`
      );
      return res.ok;
    } catch { return false; }
  }

  getTools(): ConnectorTool[] {
    return [
      {
        name: "get_current",
        description: "Get current weather conditions for a city. Defaults to configured city if city is omitted.",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string", description: "City name e.g. 'New York'. Optional." } }
        },
        execute: async (args) => {
          const city = String(args.city || this.defaultCity);
          const res = await fetch(
            `${this.baseUrl}/weather?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=imperial`
          );
          if (!res.ok) throw new Error(`OpenWeather returned ${res.status} for ${city}`);
          const d = await res.json() as any;
          return {
            city: d.name,
            tempF: Math.round(d.main.temp),
            feelsLikeF: Math.round(d.main.feels_like),
            humidity: d.main.humidity,
            description: d.weather[0].description,
            windMph: Math.round(d.wind.speed)
          };
        }
      },
      {
        name: "get_forecast",
        description: "Get 5-day weather forecast for a city",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string", description: "City name. Optional." } }
        },
        execute: async (args) => {
          const city = String(args.city || this.defaultCity);
          const res = await fetch(
            `${this.baseUrl}/forecast?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=imperial&cnt=40`
          );
          if (!res.ok) throw new Error(`OpenWeather forecast returned ${res.status}`);
          const d = await res.json() as any;
          const daily: Record<string, any> = {};
          for (const item of d.list) {
            const date = item.dt_txt.split(" ")[0];
            if (!daily[date] || item.dt_txt.includes("12:00")) {
              daily[date] = {
                date,
                highF: Math.round(item.main.temp_max),
                lowF: Math.round(item.main.temp_min),
                description: item.weather[0].description
              };
            }
          }
          return Object.values(daily).slice(0, 5);
        }
      }
    ];
  }
}
