import { injectable, inject } from "inversify";
import pino from 'pino';
import rfs from 'rotating-file-stream';
import fs from 'fs';
import pretty from 'pino-pretty';
import * as path from 'path';
import { URL } from 'url';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const dirPath = '/var/log/pilotnode';

const logFileName = 'application.log';
const logFilePath = path.join(dirPath, logFileName);

function canSetUpLogFile(): boolean {

    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath);
        } catch (error) {
            consoleError(error, `Failed to create directory: ${dirPath}`);
            return false;
        }
    }

    if (!fs.existsSync(logFilePath)) {
        try {
            fs.writeFileSync(logFilePath, '', { flag: 'a' });
        } catch (error) {
            consoleError(error, `Failed to create log file: ${logFilePath}`);
            return false;
        }
    }

    try {
        fs.accessSync(logFilePath, fs.constants.W_OK);
    } catch (error) {
        consoleError(error, `Log file is not writable: ${logFilePath}`);
        return false;
    }

    return true;
}

function consoleError(error: unknown, message: string) {
    if (error instanceof Error) {
        console.error(`${message}. Error: ${error.message}`);
    } else {
        console.error(message);
    }
}



//const logger = pino({
//    level: 'info',
//    transport: {
//        target: 'pino-pretty',
//        options: {
//            colorize: true
//        }
//    }
//});

const canLogToFile = canSetUpLogFile();

// Create a set of streams: one for the console (pretty-printed) and another for the file (if possible)
const streams: Array<any> = [
    { stream: pretty() } // Pretty print to the console
];

if (canLogToFile) {
    streams.push({
        level: 'info',
        stream: rfs.createStream(logFileName, {
            interval: '1d',
            path: dirPath
        })
    });
} else {
    console.error('Logging to file setup failed. Console logging still available.');
}

const logger = pino({
    name: 'pilotnode',
    level: 'debug', // must be the lowest level of all streams
}, pino.multistream(streams))

// Now you can use logger.info(), logger.error(), etc.
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
