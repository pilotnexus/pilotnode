#!/usr/bin/env node

var logger = require('log-driver')({ level: false });

import "reflect-metadata";
import { globalContainer } from './inversify.config';
import { ConfigService, ConfigServiceFactory } from './services/configservice';
import * as yargs from 'yargs';
import { Helper } from './helper'
import { ValueService } from './services/valueservice';
import { DigitalIOService } from './services/digitalioservice';
//import { BleService } from './services/bleservice';
import { ConnectorService } from './services/connectorservice';
// import { UsbService } from './services/usbservice';
import { AuthService  } from './services/authservice';
import { LoggingService, LogLevel } from "./services/loggingservice";
import service from 'os-service'
import { ApiService } from "./services/apiservice";

import * as fse from "fs-extra";
import { findConfigFile } from "typescript";
import { exit } from "yargs";
var path = require('path'); 

const { promisify } = require('util');

const SERVICE_NAME = 'pilotnode'


// Fetch the computer's ip and mac address 
process.on('uncaughtException', function (exception) {
  console.log(exception); // to see your exception details in the console
  // if you are on production, maybe you can send the exception details to your
  // email as well ?
});

//startup code
const argv = yargs
  .usage('Usage: $0 <command> [options]')
  .command('auth', 'Authenticate with Pilot Cloud Service')
  .command('add', 'Add PilotNode as a service')
  .command('remove', 'Remove PilotNode as a service')

  .alias('r', 'run')
  .describe('r', 'Run Service')

  .alias('c', 'config')
  .nargs('c', 1)
  .describe('c', `change default config file location (default is ${ConfigService.cfgfile})`)

  .alias('d', 'basedir')
  .nargs('d', 1)
  .describe('d', `change base directory (default is ${ConfigService.basedir})`)

  .help('h')
  .alias('h', 'help')
  .argv;

try {
  startup(argv);
}
catch (e) {
  console.log('Sorry, cannot continue, we are exiting.', e);
  process.exit(1);
}

async function checkfs(paths: string[]): Promise<boolean> {
  // check if the base directory exists and has execute permissions
  try {
    let dirstats = await fse.stat(ConfigService.basedir);
    if (!dirstats.isDirectory) {
      console.log(`${ConfigService.basedir} is not a directory`);
      return false;
    }
  }
  catch {
    // create
    try {
      await fse.mkdir(ConfigService.basedir);
    }
    catch {
      console.log(`Could not create directory ${ConfigService.basedir}.`);
      return false;
    }
  }
  
  try {
    fse.accessSync(ConfigService.basedir, fse.constants.X_OK | fse.constants.R_OK | fse.constants.W_OK);
  }
  catch {
    console.log(`Insuciffient access permissions to folder ${ConfigService.basedir}. Please change permissions (r/w/x) of the current user to this folder.`);
    return false;
  }
  
  for(const p of paths) {
    try {
      if (!fse.existsSync(p)) {
        let parentFolder = path.dirname(p);
        let dirstats = await fse.stat(parentFolder);
        if (!dirstats.isDirectory) {
          console.log(`${ConfigService.basedir} is not a directory`);
          return false;
        } else {
          try {
            fse.accessSync(ConfigService.basedir, fse.constants.X_OK);
          }
          catch {
            console.log(`We need execution permissions to directory '${parentFolder}' so we can create '${path.basename(p)}'. Please change permissions to the file.`);
            return false;
          }
        }
      } else {
        try {
          fse.accessSync(p, fse.constants.R_OK | fse.constants.W_OK);
        }
        catch {
          console.log(`We need read/write access to '${p}'. Please change permissions to the file.`);
          return false;
        }
      }
    }
    catch(e) {
      console.log('Error when checking permissions: ', e);
      return false;
    }
  }
  return true;
}

async function startup(argv: any) {
  const command = Array.isArray(argv._) && argv._.length > 0 ? argv._[0] : '';

  if (command === 'add') {
    try {
    let error = await promisify(service.add)(SERVICE_NAME, { programArgs: ["--run"] });
    if (error) {
      console.error(error);
      process.exit(1);
    } else {
      console.log('PilotNode service added.');
      console.log('run \'sudo service pilotnode start\' to start service');
      process.exit(0);
    }
    }
    catch(e) {
      console.log(e);
      console.error("Error installing service. Do you have root priviliges?");
    }
  } else if (command === 'remove') {
    try {
    let error = await promisify(service.remove)(SERVICE_NAME);
    if (error) {
      console.error(error);
      process.exit(1);
    } else {
      console.log('PilotNode service removed.');
      process.exit(0);
    }
    }
    catch(e) {
      console.log(e);
      console.error("Error removing service. Do you have root priviliges?");
    }
  } else {
    if (argv.writeconfigtoserver) {
      //let cfg: Config = await Config.load();
      //await Api.setNodeConfig(cfg.nodeid, cfg.node.mac, cfg);
    } else if (argv.readconfigfromserver) {
      //let cfg: Config = await Config.load();
      //Object.assign(cfg, await Api.getNode(config));
      //if (await Config.save(cfg)) {
      //  console.log('Settings loaded successfully.');
      //} else {
      //  console.log('Settings could not be saved.');
      //  process.exit(1);
    }
  }

  if (argv.basedir) {
    ConfigService.basedir = argv.basedir;
    ConfigService.cfgfile = path.join(ConfigService.basedir, 'pilotnode.yml');
    ConfigService.identityfile = path.join(ConfigService.basedir, 'config.yml');
  }

  if (argv.config) {
    ConfigService.cfgfile = argv.config;
  }

  // load configuration
  const configServiceFactory = globalContainer.get(ConfigServiceFactory);
  const configService = await configServiceFactory.create();

  globalContainer.bind(ConfigService).toConstantValue(configService);

  // handle parameters that need the configuration
  if (argv.debug) {
      console.log('running in DEBUG mode');
      globalContainer.get(LoggingService).logLevel = LogLevel.debug;
  }

  // check if file system permissions are present
  if (!await checkfs([ConfigService.cfgfile,   ConfigService.getAbsoluteTokenSetFilePath(configService.config)])) {
    process.exit(1);
  }

  let varSource = path.join(ConfigService.basedir, "variables");
  let varTarget = "/proc/pilot/plc/varconfig";

  if (fse.existsSync(varSource) && fse.existsSync(varTarget) ) {
    console.log('Found PLC variables...');
    try {
      fse.copyFileSync(varSource, varTarget);
      console.log('PLC variables set');
    }
    catch {
      console.log('Could not set PLC variables');
    }
  }

    let auth = globalContainer.get(AuthService);
    if (!(await auth.token())) {
      await auth.auth();
    }

    let api = globalContainer.get(ApiService);
    await api.init(); //initialize graphql subscribe

  await main(configService);
  //if (argv.run) {
    service.run (function () {
      // Stop request received (i.e. a kill signal on Linux or from the
      // Service Control Manager on Windows), so let's stop!
      service.stop (0);
    });
 // }
}

async function main(configService: ConfigService) {

  try {

    const timeSync = require('ntp-time-sync').default.getInstance();
    const result = await timeSync.getTime();
    console.log("Current System Time", new Date());
    console.log("Real Time", result.now);
    console.log("offset in milliseconds", result.offset);
  }
  catch {
    console.log("Cannot get time from NTP server");
  }



  // create connector service
  const connectorService = globalContainer.get(ConnectorService);

  // call all init hooks
  await connectorService.init();
  
  const valueService = globalContainer.get(ValueService);

  try {
    await valueService.createValues();
  }
  catch(e) {
    console.log(e);
    process.exit(1);
  }

  // call all valueCreated hooks
  await connectorService.valuesCreated(valueService.values);

  try {
    await valueService.bind();
  }
  catch(e) {
    console.log(e);
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
  