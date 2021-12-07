﻿#!/usr/bin/env node
var logger = require('log-driver')({ level: false });
import "reflect-metadata";
import { globalContainer } from './inversify.config';
import { ConfigService, ConfigServiceFactory } from './services/configservice';
import { Helper } from './helper'
import { ValueService } from './services/valueservice';
//import { BleService } from './services/bleservice';
import { ConnectorService } from './services/connectorservice';
// import { UsbService } from './services/usbservice';
import { AuthService } from './services/authservice';
import { LoggingService, LogLevel } from "./services/loggingservice";
import { ApiService } from "./services/apiservice";
import { program } from 'commander';
import * as fse from "fs-extra";
import service from 'os-service'
import { checkServerIdentity } from "tls";
var path = require('path');

process.on('uncaughtException', function (exception) {
  console.log(exception); // to see your exception details in the console
  // if you are on production, maybe you can send the exception details to your
  // email as well ?
});

program
  .command('add')
  .description('Add PilotNode to Services')
  .action(async () => {
    process.exit(await Helper.addService());
  });
program
  .command('remove')
  .description('Remove PilotNode from Services')
  .action(async () => {
    process.exit(await Helper.removeService());
  });

program
  .option('-c, --config <configfile>', 'PilotNode Configuration File', ConfigService.cfgfile)
  .option('-i, --identity <identityfile>', 'Identity File', ConfigService.identityfile)
  .option('--auth', 'authenticate with Pilot Cloud')
  .option('--debug', 'enable debug logging')
  .command('run')
  .action(async (name, options, command) => {
    service.run(function () {
      // Stop request received (i.e. a kill signal on Linux or from the
      // Service Control Manager on Windows), so let's stop!
      service.stop(0);
    });

    //startup code
    try {
      startup(options);
    }
    catch (e) {
      console.log('Sorry, cannot continue, we are exiting.', e);
      process.exit(1);
    }
  });

program.version('0.4.0');
program.parse(process.argv);


async function startup(options: any) {
  if (options.basedir) {
    ConfigService.basedir = options.basedir;
    ConfigService.cfgfile = path.join(ConfigService.basedir, 'pilotnode.yml');
    ConfigService.identityfile = path.join(ConfigService.basedir, 'config.yml');
  }

  if (options.config) {
    ConfigService.cfgfile = options.config;
  }
  if (options.identity) {
    ConfigService.identityfile = options.identity;
  }

  // load configuration
  const configServiceFactory = globalContainer.get(ConfigServiceFactory);
  const configService = await configServiceFactory.create();

  globalContainer.bind(ConfigService).toConstantValue(configService);

  // handle parameters that need the configuration
  let logService = globalContainer.get(LoggingService);
  logService.logLevel = LogLevel.debug;
  if (options.debug) {
    logService.log(LogLevel.info, 'running in DEBUG logging mode');
    globalContainer.get(LoggingService).logLevel = LogLevel.debug;
  }

  // check if file system permissions are present
  if (!await Helper.checkfs([ConfigService.cfgfile, ConfigService.getAbsoluteTokenSetFilePath(configService.config)])) {
    process.exit(1);
  }

  let varSource = path.join(ConfigService.basedir, "variables");
  let varTarget = "/proc/pilot/plc/varconfig";

  if (fse.existsSync(varSource) && fse.existsSync(varTarget)) {
    logService.log(LogLevel.info, 'Found PLC variables...');
    try {
      fse.copyFileSync(varSource, varTarget);
      logService.log(LogLevel.info, 'PLC variables set');
    }
    catch {
      logService.log(LogLevel.error, 'Could not set PLC variables');
    }
  }

  let unauthorized = false;
  let auth = globalContainer.get(AuthService);

  //check if we should authorize
  if (options.auth) {
    await auth.auth();
  }
  if (!(await auth.token())) {
    unauthorized = true;
  }

  let api = globalContainer.get(ApiService);
  await api.init(unauthorized); //initialize graphql subscribe

  await main(configService, logService);
}

async function main(configService: ConfigService, logService: LoggingService) {
  try {
    const timeSync = require('ntp-time-sync').default.getInstance();
    const result = await timeSync.getTime();
    logService.log(LogLevel.info, "Current System Time", new Date());
    logService.log(LogLevel.info, "Real Time", result.now);
    logService.log(LogLevel.info, "offset in milliseconds", result.offset);
  }
  catch {
    logService.log(LogLevel.error, "Cannot get time from NTP server");
  }

  // create connector service
  const connectorService = globalContainer.get(ConnectorService);

  // call all init hooks
  await connectorService.init();

  const valueService = globalContainer.get(ValueService);

  try {
    await valueService.createValues();
  }
  catch (e) {
    logService.log(LogLevel.error, e);
    process.exit(1);
  }

  // call all valueCreated hooks
  await connectorService.valuesCreated(valueService.values);

  try {
    await valueService.bind();
  }
  catch (e) {
    logService.log(LogLevel.error, e);
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
}
