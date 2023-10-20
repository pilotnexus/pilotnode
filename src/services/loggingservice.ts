import { injectable, inject } from "inversify";
import pino from 'pino';
import rfs from 'rotating-file-stream';

const stream = rfs.createStream('application.log', {
    interval: '1d',
    path: '/var/log/pilotnode',
});

const logger = pino({
    level: 'info',
    prettyPrint: true,
}, stream);

@injectable()
export class LoggingService {
    // Expose the logger instance directly
    logger = logger;

    logMessage(level: string, ...params: any[]) {
        if (typeof this.logger[level] === 'function') {
            this.logger[level](...params);
        } else {
            this.logger.fatal(`Invalid log level: ${level}`);
        }
    }
}
