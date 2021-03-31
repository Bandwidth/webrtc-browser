import { EventEmitter } from "events";

enum Level {
  off,
  error,
  warn,
  info,
  debug,
}

// "off" | "error" | "warn" | "info" | "debug"
export type LogLevel = keyof typeof Level;

class Logger extends EventEmitter {
  private _level: Level;

  constructor(level?: LogLevel) {
    super();
    this._level = level ? Level[level] : Level.warn;
  }

  set level(level: LogLevel) {
    this._level = Level[level];
  }

  log(level: LogLevel, ...args: any) {
    const now = new Date(Date.now()).toISOString();
    if (this._level >= Level[level] && console) {
      // @ts-ignore
      console[level](now, ...args);
    }
    this.emit("log", level, now, ...args);
  }

  error(...args: any) {
    this.log("error", ...args);
  }

  warn(...args: any) {
    this.log("warn", ...args);
  }

  info(...args: any) {
    this.log("info", ...args);
  }

  debug(...args: any) {
    this.log("debug", ...args);
  }
}

const logger = new Logger();
export default logger;
