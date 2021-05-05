import { EventEmitter } from "events";
import logger, { LogLevel } from "../logging";

export type Diagnostics = {
  logs?: any[];
};

export class DiagnosticsBatcher extends EventEmitter {
  private logEvents: any[];

  constructor(flushIntervalMillis = 300000) {
    super();
    this.logEvents = new Array();

    logger.on("log", this.handleLogEvent.bind(this));
    setInterval(this.flushDiagnostics.bind(this), flushIntervalMillis);
  }

  getDiagnostics(): Diagnostics {
    return { logs: this.logEvents };
  }

  flushDiagnostics() {
    this.emit("diagnostics", this.getDiagnostics());
    this.logEvents = new Array();
  }

  private handleLogEvent(level: LogLevel, timestamp: any, ...args: any) {
    this.logEvents.push({
      level,
      timestamp,
      message: args,
    });
  }
}
