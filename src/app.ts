﻿#!/usr/bin/env node

import "reflect-metadata";
import { globalContainer } from './inversify.config.js';
import { ConfigService, ConfigServiceFactory } from './services/configservice.js';
import { Helper } from './helper.js';
import { ValueService } from './services/valueservice.js';
import { ConnectorService } from './services/connectorservice.js';
import { AuthService } from './services/authservice.js';
import { LoggingService } from "./services/loggingservice.js";
import { ApiService } from "./services/apiservice.js";
import { program } from 'commander';
import fs from "fs-extra";
import service from 'os-service'
import { checkServerIdentity } from "tls";
import { NtpTimeSync } from "ntp-time-sync";
import * as path from 'path';
import SegfaultHandler from 'segfault-handler';

import {
    getBasedir,
    getCfgfile,
    getIdentityfile,
    getVariablefile,
    getDefaultapiurl,
    setBasedir,
    setCfgfile,
    setIdentityfile
} from "./folders.js";

//import { BleService } from './services/bleservice';
// import { UsbService } from './services/usbservice';

let logService = globalContainer.get(LoggingService);

SegfaultHandler.registerHandler("/var/log/pilotnode/crash.log", function(signal, address, stack) {
    try {
        const indentedStack = stack.map(line => `    ${line}`).join('\n');

        logService.logger.fatal(`App Crash, Signal: ${signal}, Address: ${address}\nStack Trace:\n${indentedStack}`);
    } catch { }
})

process.on('uncaughtException', function(exception) {
    logService.logger.error(`Uncaught Exception: ${exception.toString()}`);
});

let terminate: Function | null = null;

program
    .command('run', { isDefault: true })
    .option('-c, --config <configfile>', 'PilotNode Configuration File', getCfgfile())
    .option('-i, --identity <identityfile>', 'Identity File', getIdentityfile())
    .option('-a, --auth', 'authenticate with Pilot Cloud')
    .option('-d, --debug', 'enable debug logging')
    .option('-s, --setvariables [varfile]', 'set variables from variable file')
    .description('Runs PilotNode')
    .action(async (options, command) => {
        service.run(async () => {
            console.log("Stop request received");
            if (terminate) {
                await terminate();
            }

            service.stop(0);
        });

        //startup code
        try {
            terminate = await startup(options);
        }
        catch (e) {
            console.log('Sorry, cannot continue, we are exiting.', e);
            process.exit(1);
        }
    });

program
    .command('validate')
    .option('-c, --config <configfile>', 'PilotNode Configuration File', getCfgfile())
    .option('-i, --identity <identityfile>', 'Identity File', getIdentityfile())
    .option('--debug', 'enable debug logging')
    .description('Validates PilotNode configuration file')
    .action(async (options, command) => {
        let config = await config_init(options);
        let results = config.validate();
        if (results.length > 0) {
            for (var result of results) {
                console.log(result);
            }
        } else {
            console.log(`No Errors in ${getCfgfile()} found.`);
        }
        process.exit(0);
    });

program
    .command('install-service')
    .description('Add PilotNode to Services')
    .action(async () => {
        process.exit(await Helper.addService());
    });
program
    .command('remove-service')
    .description('Remove PilotNode from Services')
    .action(async () => {
        process.exit(await Helper.removeService());
    });

program.version(await Helper.getPackageVersion());
program.parse(process.argv);

async function config_init(options: any): Promise<ConfigService> {
    if (options.basedir) {
        setBasedir(options.basedir);
    }

    if (options.config) {
        setCfgfile(options.config);
    }
    if (options.identity) {
        setIdentityfile(options.identity);
    }

    // load configuration
    const configServiceFactory = globalContainer.get(ConfigServiceFactory);
    const configService = await configServiceFactory.create();

    globalContainer.bind(ConfigService).toConstantValue(configService);

    return configService;
}

async function startup(options: any): Promise<Function> {

    // handle parameters that need the configuration
    //let logService = globalContainer.get(LoggingService);
    if (options.debug) {
        logService.logger.info('running in DEBUG logging mode');
        globalContainer.get(LoggingService).logger.level = 'debug';
    }

    let configService = await config_init(options);

    // check if file system permissions are present
    if (!await Helper.checkfs([getCfgfile(), ConfigService.getAbsoluteTokenSetFilePath(configService.config)])) {
        process.exit(1);
    }

    if (options.setvariables !== undefined) {
        let varSource = options.setvariables === true ? getVariablefile() : options.setvariables;
        let varTarget = "/proc/pilot/plc/varconfig";

        if (fs.existsSync(varSource) && fs.existsSync(varTarget)) {
            logService.logger.info(`Found PLC variables at ${varSource}`);
            try {
                fs.copyFileSync(varSource, varTarget);
                logService.logger.info('PLC variables set');
            }
            catch (e: any) {
                logService.logger.error('Could not set PLC variables');
                logService.logger.error(e);
            }
        } else {
            logService.logger.error(`Variable file ${options.setvariables} does not exist, skipping`);
        }
    }

    let unauthorized = false;
    let auth = globalContainer.get(AuthService);
    await auth.init(); //Required!

    //check if we should authorize
    if (options.auth) {
        await auth.auth();
    }
    if (!(await auth.token())) {
        unauthorized = true;
    }

    let api = globalContainer.get(ApiService);
    await api.init(unauthorized); //initialize graphql subscribe

    return main(configService, logService);
}

async function main(configService: ConfigService, logService: LoggingService): Promise<Function> {
    try {
        const timeSync = NtpTimeSync.getInstance();
        const result = await timeSync.getTime();
        logService.logger.info(`Current System Time ${new Date()}`);
        logService.logger.info(`Real Time ${result.now}`);
        logService.logger.info(`offset in milliseconds ${result.offset}`);
    }
    catch (e: any) {
        logService.logger.error("Cannot get time from NTP server");
        logService.logger.error(e.toString());
    }

    // create connector service
    const connectorService = globalContainer.get(ConnectorService);

    // call all init hooks
    let terminate = await connectorService.init();

    const valueService = globalContainer.get(ValueService);

    try {
        await valueService.createValues();
    }
    catch (e: any) {
        logService.logger.error(e.toString());
        process.exit(1);
    }

    // call all valueCreated hooks
    await connectorService.valuesCreated(valueService.values);

    try {
        await valueService.bind();
    }
    catch (e: any) {
        logService.logger.error(e.toString());
        process.exit(1);
    }

    // call all valuesBound hooks
    await connectorService.valuesBound(valueService.values);

    //if (!await configService.saveConfig()) {
    //  console.log('Failed to save configuration to local config file. Are write permissions missing?');
    //}
    configService.parameters = await globalContainer.get(ApiService).nodeupdate();


    // TODO - inplement modes (server, local, etc)
    //let node = await Config.saveNode(config); //save node config to server.
    //try {
    //let bleService = new BleService( (node && node.name) ? node.name : "Pilot Nexus", config);
    //} catch {}

    return terminate;
}
