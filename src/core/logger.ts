import fs from "fs";
import path from "path";

const LOG_FILE = path.resolve(process.cwd(), "debug.log");
const OLD_FILE = LOG_FILE + ".old";
const MAX_BYTES = 5 * 1024 * 1024; // rotate after 5 MB

function serialize(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === "object" && arg !== null) {
    try { return JSON.stringify(arg); } catch { return String(arg); }
  }
  return String(arg);
}

/**
 * Initialises file-based logging.
 *
 * MUST be called AFTER any console-filtering (e.g. SILENT_MODE) so that this
 * wrapper fires first and writes every message to disk before the filtered
 * terminal path decides whether to print it.
 */
export function initFileLogger(): void {
  // Rotate if the file is getting large
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, OLD_FILE);
    }
  } catch { /* ignore rotation errors */ }

  const stream = fs.createWriteStream(LOG_FILE, { flags: "a" });

  const sep = "=".repeat(60);
  stream.write(`\n${sep}\nSESSION START: ${new Date().toISOString()}\n${sep}\n`);

  const write = (level: string, args: unknown[]): void => {
    const line = `[${new Date().toISOString()}] [${level.padEnd(5)}] ${args.map(serialize).join(" ")}\n`;
    stream.write(line);
  };

  // Capture what console currently points at (may already be SILENT_MODE's
  // filtered version — that's intentional; we write to file before delegating).
  const prev = {
    log:   console.log.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args: unknown[]) => { write("LOG",   args); prev.log(...args);   };
  console.warn  = (...args: unknown[]) => { write("WARN",  args); prev.warn(...args);  };
  console.error = (...args: unknown[]) => { write("ERROR", args); prev.error(...args); };

  process.on("uncaughtException", (err: Error) => {
    write("FATAL", [`uncaughtException: ${err.stack ?? err.message}`]);
    stream.end(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason: unknown) => {
    write("FATAL", [`unhandledRejection: ${serialize(reason)}`]);
  });

  process.on("exit", () => {
    stream.write(`[${new Date().toISOString()}] [EXIT ] Process exiting.\n`);
    stream.end();
  });

  console.log(`📋 [Logger] Writing to ${LOG_FILE}`);
}
