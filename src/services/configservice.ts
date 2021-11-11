import { injectable, inject } from "inversify";
import * as yaml from "js-yaml";
import * as os from "os";
import * as fse from "fs-extra";
import "reflect-metadata";
import { TokenSet } from "openid-client";
import { LoggingService, LogLevel } from "./loggingservice";
import path from 'path';
import * as Joi from 'joi';
import { v4 as uuid_v4 } from 'uuid';
const address = require('address');

export enum ConfigMode {
  server = "server",
  local = "local"
}

export interface IConnectorConfig {
  name: string;
  type: string;
  config: any;
  autobind?: any;
}

const IConnectorConfigSchema = Joi.array().items({
  name: Joi.string(),
  type: Joi.string(),
  config: Joi.object(),
  autobind: Joi.object()
});

/// Data in this interface is persisted to the config file
export class Config {
  nodeid: string = ''; // local only (set by pilot setup)

  graphqlurl: string = 'https://gql.pilotnexus.io/v1/graphql';
  graphqlwsurl: string = 'wss://gql.pilotnexus.io/v1/graphql';
  configmode: ConfigMode = ConfigMode.server; // local only

  connectors: IConnectorConfig[] = [];
  values: any = {};

  // tokenset file path, relative to config file path
  tokenSetFile: string = '';

  ConfigSchema = Joi.object().keys({
    nodeid: Joi.string(),
    connectors: IConnectorConfigSchema,
    values: Joi.object()
  })

  public constructor(init?: Partial<Config>) {

    if (!this.tokenSetFile) {
      this.tokenSetFile = './auth.json'
    }

    const result = this.ConfigSchema.validate(init);
    if (result.error) {
      throw new Error(result.error.message);
    }

    Object.assign(this, result.value);
  }
}

/// Config that is loaded dynamically on startup and sent to server
/// but is not persisted to config file
export class ToServerConfig {
  mac: string = ''; // written to server
  ipaddresses: string[] = []; // not used for now

  public constructor(init?: Partial<ToServerConfig>) {
    Object.assign(this, init);
  }
}

/// config loaded from server
/// but not persisted to config file
export class FromServerConfig {
  node: Node|null = null; // loaded from server
}

export interface IProject {
  id: string;
  name: string;
  description: string;
}

export interface IInstance {
  id: string;
  name: string;
  server: string;
  groupname: string;
  description: string;
  config: any;
}

export interface NodeConfig {
  name: string;
  owner: string;
  groupname: string;
  description: string;
  instance: IInstance;
  project: IProject;
}

async function createConfig() {}

@injectable()
export class ConfigServiceFactory {

  constructor (private log: LoggingService) {}

  async create() {
    let config = await ConfigService.loadConfig(this.log);
    let toServer = await ConfigService.loadToServerConfig(this.log);
    let tokenset = await ConfigService.loadTokenset(config);
    let configService = new ConfigService(config, toServer, tokenset, this.log);
    return configService;
  }
}

@injectable()
export class ConfigService {
  fromServer: FromServerConfig|null = null;
  node: NodeConfig|null = null;

  static basedir: string = "/etc/pilot/";
  // Pilot Node configuration file
  static cfgfile: string = `${ConfigService.basedir}pilotnode.yml`;
  // Shared file (Pilot Daemon/Pilot Node) containing Node Name and UUID
  static identityfile: string = `${ConfigService.basedir}config.yml`;
  static defaultapiurl: string = "https://gql.pilotnexus.io/v1/query";

  /// configuration parameters loaded from Pilot Cloud Service
  parameters: any = {};

  constructor(public config: Config, public toServer: ToServerConfig, public tokenSet: TokenSet, private log: LoggingService) {
  }

  verify(config: Config): boolean {
    let ok = true;



    //checks

    //let subscriptions = [];
    //if (config.subscriptions) {
    //  ConfigService.flattenSubscriptions(config.subscriptions, subscriptions);
    //}

    //config.subscriptions = subscriptions;

    //if (!config.pilotapiurl) {
    //  config.pilotapiurl = ConfigService.defaultapiurl;
    //}
    //if (!config.configmode) {
    //  config.configmode = ConfigMode.server;
    //}

    if (!config.nodeid) {
      this.log.log(
        LogLevel.error,
        "No Node Id. Please configure node first using the pilot config tool."
      );
      ok = false;
    } else {
      this.log.log(LogLevel.info, `Node Id: ${config.nodeid}`);
    }
    return ok;
  }
  
  static async loadToServerConfig(log: LoggingService): Promise<ToServerConfig> {
    // load ToServerConfig
    let ipaddresses: string[] = [];
    let ifaces = os.networkInterfaces();
    for (const ifname of Object.keys(ifaces)) {
        const f = ifaces[ifname];
        if (f) {
          for (const iface of f) {

        if ("IPv4" !== iface.family || iface.internal !== false) {
          // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
          break; // from forEach function
        }

        // if (alias >= 1) {
        //   // this single interface has multiple ipv4 addresses
        //   console.log(ifname + ':' + alias, iface.address);
        // } else {
        //   // this interface has only one ipv4 adress
        //   console.log(ifname, iface.address);
        // }
        //++alias;
        ipaddresses.push(iface.address);
          }
        }
      }

      let mac:string = await (new Promise<string>(resolve => { address(function (err: any, addrs: any) {
        if (addrs.mac) {
          resolve(addrs.mac);
        } else {
          resolve('');
        }
      })}));
    
    //let mac = getMAC();
    return new ToServerConfig({ mac, ipaddresses });
  }

  static async fileLoader(filename: string): Promise<any> {
    if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
      return yaml.safeLoad(await fse.readFile(filename, "utf8"))
    } else if (filename.endsWith('.json')) {
      return JSON.parse(await fse.readFile(filename, "utf8"));
    } else {
      throw new Error(`${filename} needs to be a Json (.json) or Yaml (.yml or .yaml) file.`);
    }
  }

  static async fileWriter(filename: string, content: any): Promise<void> {
    let stringContent: string | undefined = undefined;
    if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
      stringContent = yaml.safeDump(content);
    } else if (filename.endsWith('.json')) {
      stringContent = JSON.stringify(content);
    } else {
      throw new Error(`${filename} needs to be a Json (.json) or Yaml (.yml or .yaml) file.`);
    }

    if (typeof stringContent !== 'undefined') {
      await fse.writeFile(filename, stringContent, { encoding: "utf8" });
    }
  }

  static async loadIdentity(log: LoggingService): Promise<Config> {
    let identityfile = path.resolve(ConfigService.identityfile);
    try {
      log.log(LogLevel.info, "Parsing " + identityfile);
      
      if (!fse.existsSync(identityfile)) {
        log.log(LogLevel.warn, "Identity file does not exist, generating one with a new Node ID");
        this.fileWriter(identityfile, {name: "new node", nodeid: uuid_v4()});
      }

      return await this.fileLoader(identityfile);
    } catch (e) {
      log.log(LogLevel.error, `ERROR: Could not load config file ${ConfigService.cfgfile}`, e);
      //TODO - fallback to server config?
      throw e;
    }
  }

  static async loadConfig(log: LoggingService): Promise<Config> {
    // load config
    let cfgfile = path.resolve(ConfigService.cfgfile);
    try {
      log.log(LogLevel.info, "Parsing " + cfgfile);
      
      if (!fse.existsSync(cfgfile)) {
        log.log(LogLevel.warn, "Configuration file does not exist, generating one with a new Node ID");
        this.fileWriter(cfgfile, {nodeid: uuid_v4()});
      }

      let config = await this.fileLoader(cfgfile);

      if ('values' in config) {
        for (const value in config.values) {
          if ('ref' in config.values[value]) {
            let filename = path.resolve(path.dirname(cfgfile), config.values[value]['ref']);
            let externValues = await this.fileLoader(filename);
            delete config.values[value]; //remove reference value
            for (const externValue in externValues) {
              config.values[`${value}.${externValue}`] = externValues[externValue];
            }
          }
        }
      }

      let identity = this.loadIdentity(log);
      //create object and sanity check configuration
      let configObj = new Config({...identity, ...config});

      return configObj;
    } catch (e) {
      log.log(LogLevel.error, `ERROR: Could not load config file ${ConfigService.cfgfile}`, e);
      //TODO - fallback to server config?
      throw e;
    }
  }

  async saveConfig(): Promise<boolean> {
    let that = this;
    try {
      await fse.writeFile(ConfigService.cfgfile, yaml.safeDump(that.config));
      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  static getAbsoluteTokenSetFilePath(config:Config) {
    return path.resolve(path.dirname(path.resolve(ConfigService.cfgfile)), config.tokenSetFile);
  }

  static async loadTokenset(config: Config): Promise<TokenSet> {
    let tokenSetFile = ConfigService.getAbsoluteTokenSetFilePath(config);

    if (tokenSetFile) {
      try {
        return new TokenSet(
          JSON.parse(await fse.readFile(tokenSetFile, { encoding: "utf8" }))
        );
      } catch {} // fail silently, if tokenSet not configured, isInitialized returns false and authorization is required
    }
    return new TokenSet(); //empty tokenset, needs to be filled by authenticating
  }

  async saveTokenset(): Promise<boolean> {
    let that = this;
    let ok = false;
    let tokenSetFile = ConfigService.getAbsoluteTokenSetFilePath(that.config);

    if (that.tokenSet) {
      await fse.writeFile(tokenSetFile, JSON.stringify(that.tokenSet), {
        encoding: "utf8"
      });
      ok = true;
    }
    return ok;
  }
}
