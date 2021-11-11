import { injectable, inject } from "inversify";

export enum LogLevel {
  error,
  warn,
  info,
  verbose,
  debug
}

@injectable()
export class LoggingService {
  logLevel: LogLevel = LogLevel.info;

  log(level: LogLevel, ...params: any[]) {
    if (level <= this.logLevel) {
      console.log(...params);
    }
  }
}
