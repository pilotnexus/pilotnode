import fs from "fs-extra";
import { FileValueConfig, IFileValueConfig } from "./filevalueconfig.js";
import { ValueGroup, SubValue } from "../../value.js";
import { LoggingService, LogLevel } from "../../services/loggingservice.js";
import path from 'path';
import { getJSDocThisTag } from "typescript";
import Joi from 'joi';

interface IPilotServiceMessage {
    result: any;
    error?: string;
}

export const IPilotServiceConfigSchema = Joi.object().keys({
    driverPath: Joi.string(),
    ip: Joi.string(),
    port: Joi.number(),
    timeout: Joi.number(),
});

export class PilotServiceConfig implements PilotServiceConfig {
    driverPath = '/proc/pilot';
    ip = 'localhost' //test only
    port = 4242;
    timeout = 10000;


    public constructor(init?: Partial<PilotServiceConfig>) {
        Object.assign(this, init);
    }
}

export class PilotService {

    dirs = async (p: string) => (await fs.readdir(p)).filter(async f => (await fs.stat(path.join(p, f))).isDirectory());

    connected: boolean;

    constructor(nodeid: string, private config: PilotServiceConfig, private logService: LoggingService) {
        this.connected = false;
    }

    async create() {
        let that = this;

        //TODO connect to Pilot Daemon

    }

}
