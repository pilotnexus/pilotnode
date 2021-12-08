var path = require('path'); 
const { promisify } = require('util');
import service from 'os-service'
import * as fse from "fs-extra";
import { ConfigService } from './services/configservice';

const SERVICE_NAME = 'pilotnode'

export interface IGraphQLReply {
  data: any;
}

export class Helper {

  static validateIPaddress(ipaddress: string) : boolean {
    if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress)) {
      return true;
    }
    return false;
  } 

  static validateDomainName(domain: string) : boolean {
    if (/^(([a-zA-Z]{1})|([a-zA-Z]{1}[a-zA-Z]{1})|([a-zA-Z]{1}[0-9]{1})|([0-9]{1}[a-zA-Z]{1})|([a-zA-Z0-9][a-zA-Z0-9-_]{1,61}[a-zA-Z0-9]))\.([a-zA-Z]{2,6}|[a-zA-Z0-9-]{2,30}\.[a-zA-Z]{2,3})$/.test(domain)) {
      return true;
    }
    return false;
  }

  static validateLinuxUserName(user: string) : boolean {
    if (/^[a-z_]([a-z0-9_-]{0,31}|[a-z0-9_-]{0,30}\$)$/.test(user)) {
      return true;
    } else {
      return false;
    }
  }

  static getEnumValues<T extends string | number>(e: any): T[] {
          return typeof e === 'object' ? Object.keys(e).map(key => e[key]) : [];
  }

  static async addService() {
    var exitCode = 0;
    //add 
    try {
    let error = await promisify(service.add)(SERVICE_NAME, { programArgs: ["run"] });
    if (error) {
      console.error(error);
      exitCode = 1;
    } else {
      console.log('PilotNode service added.');
      console.log('run \'sudo service pilotnode start\' to start service');
    }
    }
    catch(e) {
      console.log(e);
      console.error("Error installing service. Do you have root priviliges?");
      exitCode = 1;
    }

    return exitCode;
  }

  static async removeService() {
    var exitCode = 0;
    try {
    let error = await promisify(service.remove)(SERVICE_NAME);
    if (error) {
      console.error(error);
      exitCode = 1;
    } else {
      console.log('PilotNode service removed.');
    }
    }
    catch(e) {
      console.log(e);
      console.error("Error removing service. Do you have root priviliges?");
      exitCode = 1;
    }
    return exitCode;
  }

static async checkfs(paths: string[]): Promise<boolean> {
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

}