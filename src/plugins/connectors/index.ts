import { ConnectorRegistry } from "../../core/connectorRegistry";
import { YahooFinanceConnector } from "./yahooFinanceConnector";
import { AlphaVantageConnector } from "./alphaVantageConnector";
import { OpenWeatherConnector } from "./openWeatherConnector";
import { TodoistConnector } from "./todoistConnector";
import { GoogleCalendarConnector } from "./googleCalendarConnector";
import { OutlookCalendarConnector } from "./outlookCalendarConnector";
import { GmailConnector } from "./gmailConnector";
import { OutlookMailConnector } from "./outlookMailConnector";
import { GoogleTasksConnector } from "./googleTasksConnector";

export function registerAllConnectors(): void {
  ConnectorRegistry.registerDefinition(new YahooFinanceConnector());
  ConnectorRegistry.registerDefinition(new AlphaVantageConnector());
  ConnectorRegistry.registerDefinition(new OpenWeatherConnector());
  ConnectorRegistry.registerDefinition(new TodoistConnector());
  ConnectorRegistry.registerDefinition(new GoogleCalendarConnector());
  ConnectorRegistry.registerDefinition(new OutlookCalendarConnector());
  ConnectorRegistry.registerDefinition(new GmailConnector());
  ConnectorRegistry.registerDefinition(new OutlookMailConnector());
  ConnectorRegistry.registerDefinition(new GoogleTasksConnector());
  console.log("✅ [Connectors] All connector definitions registered.");
}
