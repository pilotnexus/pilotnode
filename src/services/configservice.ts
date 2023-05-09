import { injectable } from "inversify";
import * as yaml from "js-yaml";
import * as os from "os";
import fs from "fs-extra";
import "reflect-metadata";
import { TokenSet } from "openid-client";
import { LoggingService, LogLevel } from "./loggingservice.js";
import path from 'path';
import Joi from 'joi';
import { v4 as uuid_v4 } from 'uuid';
import { globalContainer } from "../inversify.config.js";
import { IConnectorValidator } from "../connector_validators/connectorvalidator.js";
import { NAMED_OBJECTS } from "../inversify.config.js";
import { IConnectorFactory } from "../connectors/connector.js";
import { IConnector } from "../connectors/connector.js";
import { Helper } from "../helper.js";
import address from 'address';
import {
    getBasedir,
    getCfgfile,
    getIdentityfile,
    getVariablefile,
    getDefaultapiurl,
} from "../folders.js";

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

const tokenSetFileDefaultValue = "./auth.json";

/// Data in this interface is persisted to the config file
export class Config {
    nodeid: string = ''; // local only (set by pilot setup)

    pilotapiurl: string = 'https://gql.pilotnexus.io/v1/graphql';
    pilotapiws: string = 'wss://gql.pilotnexus.io/v1/graphql';
    configmode: ConfigMode = ConfigMode.server; // local only

    connectors: IConnectorConfig[] = [];
    values: any = {};

    // tokenset file path, relative to config file path
    tokenSetFile: string = '';

    public constructor(init?: Partial<Config>) {

        if (!this.tokenSetFile) {
            this.tokenSetFile = tokenSetFileDefaultValue;
        }

        Object.assign(this, init);
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
    node: Node | null = null; // loaded from server
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

async function createConfig() { }

@injectable()
export class ConfigServiceFactory {

    constructor(private log: LoggingService) { }

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
    fromServer: FromServerConfig | null = null;
    node: NodeConfig | null = null;

    /// configuration parameters loaded from Pilot Cloud Service
    parameters: any = {};

    constructor(public config: Config, public toServer: ToServerConfig, public tokenSet: TokenSet, private log: LoggingService) {
    }

    ConfigSchema = Joi.object().keys({
        nodeid: Joi.string().required(),
        name: Joi.string(),
        pilotapiurl: Joi.string(),
        pilotapiws: Joi.string(),
        configmode: Joi.string().valid(...Helper.getEnumValues(ConfigMode)),
        tokenSetFile: Joi.string(),
        connectors: Joi.array(),
        values: Joi.object()
    })

    validate(): Array<Joi.ValidationResult<any>> {

        let that = this;
        let validationResults: Array<Joi.ValidationResult<any>> = [];

        //validate root objects
        var result = that.ConfigSchema.validate(that.config);
        if (result.error) {
            validationResults.push(result);
        }

        let connectors: any[] = globalContainer.getAll<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR);
        let connectorFactories: { [type: string]: (name: string, config: any) => IConnector } = connectors.reduce((map: any, obj: any) => (map[obj.type] = obj.create.bind(obj), map), {});
        let connector_validators: any[] = globalContainer.getAll<IConnectorValidator>(NAMED_OBJECTS.CONNECTOR_VALIDATOR);
        let connector_validator_configschema: { [type: string]: () => Joi.ObjectSchema<any> } = connector_validators.reduce((map: any, obj: any) => (map[obj.type] = obj.configschema.bind(obj), map), {});


        if (that.config.connectors) {
            for (let conn of that.config.connectors) {
                if (conn.type in connectorFactories) {
                    if (conn.type in connector_validator_configschema) {
                        let configschema = connector_validator_configschema[conn.type]();
                        let result = configschema.validate(conn.config);
                        if (result.error) {
                            validationResults.push(result);
                        }
                    } else {
                        that.log.log(LogLevel.error, `Connector '${conn.name}' has no validator`);
                    }
                } else {
                    that.log.log(LogLevel.error, `Connector '${conn.name}' does not have type specified`);
                }
            }
        }
        return validationResults;
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

        let mac: string = await (new Promise<string>(resolve => {
            address(function(err: any, addrs: any) {
                if (addrs.mac) {
                    resolve(addrs.mac);
                } else {
                    resolve('');
                }
            })
        }));

        //let mac = getMAC();
        return new ToServerConfig({ mac, ipaddresses });
    }

    static async fileLoader(filename: string): Promise<any> {
        if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
            return yaml.load(await fs.readFile(filename, "utf8"))
        } else if (filename.endsWith('.json')) {
            return JSON.parse(await fs.readFile(filename, "utf8"));
        } else {
            throw new Error(`${filename} needs to be a Json (.json) or Yaml (.yml or .yaml) file.`);
        }
    }

    static async fileWriter(filename: string, content: any): Promise<void> {
        let stringContent: string | undefined = undefined;
        if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
            stringContent = yaml.dump(content);
        } else if (filename.endsWith('.json')) {
            stringContent = JSON.stringify(content);
        } else {
            throw new Error(`${filename} needs to be a Json (.json) or Yaml (.yml or .yaml) file.`);
        }

        if (typeof stringContent !== 'undefined') {
            await fs.writeFile(filename, stringContent, { encoding: "utf8" });
        }
    }

    static async loadIdentity(log: LoggingService): Promise<Config> {
        let identityfile = path.resolve(getIdentityfile());
        try {
            log.log(LogLevel.debug, "Parsing " + identityfile);

            if (!await fs.exists(identityfile)) {
                log.log(LogLevel.warn, "Identity file does not exist, generating one with a new Node ID");
                this.fileWriter(identityfile, { name: "new node", nodeid: uuid_v4() });
            }

            return await this.fileLoader(identityfile);
        } catch (e) {
            log.log(LogLevel.error, `ERROR: Could not load config file ${getCfgfile()}`, e);
            //TODO - fallback to server config?
            throw e;
        }
    }

    static async loadConfig(log: LoggingService): Promise<Config> {
        // load config
        let cfgfile = path.resolve(getCfgfile());
        try {
            log.log(LogLevel.debug, "Parsing " + cfgfile);

            if (!await fs.exists(cfgfile)) {
                log.log(LogLevel.warn, "Configuration file does not exist, generating one with a new Node ID");
                this.fileWriter(cfgfile, { nodeid: uuid_v4() });
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

            //Integrate uuid as nodeid and name to config from shared config file. 
            let identity: any = await this.loadIdentity(log);
            if (identity && identity["uuid"]) {
                config["nodeid"] = identity["uuid"];
            }
            if (identity && identity["name"]) {
                config["name"] = identity["name"];
            }

            //create object and sanity check configuration
            let configObj = new Config(config);

            log.log(LogLevel.debug, `Node Id: ${configObj.nodeid}`);
            return configObj;
        } catch (e) {
            log.log(LogLevel.error, `ERROR: Could not load config file ${getCfgfile()}`, e);
            //TODO - fallback to server config?
            throw e;
        }
    }

    async saveConfig(): Promise<boolean> {
        let that = this;
        try {
            await fs.writeFile(getCfgfile(), yaml.dump(that.config));
            return true;
        } catch (e) {
            console.log(e);
            return false;
        }
    }

    static getAbsoluteTokenSetFilePath(config: Config) {
        let tokenSetFile = tokenSetFileDefaultValue;
        if (config.tokenSetFile) {
            tokenSetFile = config.tokenSetFile;
        }

        return path.resolve(path.dirname(path.resolve(getCfgfile())), tokenSetFile);
    }

    static async loadTokenset(config: Config): Promise<TokenSet> {
        let tokenSetFile = ConfigService.getAbsoluteTokenSetFilePath(config);

        if (tokenSetFile) {
            try {
                return new TokenSet(
                    JSON.parse(await fs.readFile(tokenSetFile, { encoding: "utf8" }))
                );
            } catch { } // fail silently, if tokenSet not configured, isInitialized returns false and authorization is required
        }
        return new TokenSet(); //empty tokenset, needs to be filled by authenticating
    }

    async saveTokenset(): Promise<boolean> {
        let that = this;
        let ok = false;
        let tokenSetFile = ConfigService.getAbsoluteTokenSetFilePath(that.config);

        if (that.tokenSet) {
            await fs.writeFile(tokenSetFile, JSON.stringify(that.tokenSet), {
                encoding: "utf8"
            });
            ok = true;
        }
        return ok;
    }
}
