import { injectable, inject } from "inversify";
import * as knx from 'knx';
import { ConnectorConfig, ValueGroup, SubValue } from '../../value';
import { ConfigService } from '../../services/configservice';
import { CodesysValueConfig } from './codesysvalueconfig';
import { LoggingService, LogLevel } from '../../services/loggingservice';
import { IConnectorFactory, IConnector } from '../connector';
import { globalContainer } from "../../inversify.config";
import { provide } from 'inversify-binding-decorators';
import { NAMED_OBJECTS } from "../../inversify.config";

import { client, Options } from 'netvar';
import { isJSDocThisTag } from "typescript";
import { Types } from "netvar/dist/types";


var colors = require('colors/safe'); // does not alter string prototype

class CodesysConfig {
    ip: string = '';
    port: number = 1202;
    debug: boolean = false;
  
    public constructor(init?: Partial<CodesysConfig>) {
      Object.assign(this, init);
    }
}

@injectable()
export class CodesysConnectorFactory implements IConnectorFactory {
  type = 'codesys';

  create(name: string, config: any) : IConnector {
    return new CodesysConnector(name, config, globalContainer.get(LoggingService));
  }
}

interface IList {
  set(name: string): void;
}

@injectable()
export class CodesysConnector implements IConnector {
  
  connection: {
    openList: <T extends {
        [k: string]: Types;
    }>(options: Options, vars: T) => {
        set: <K extends keyof T>(name: K, value: T[K]["value"]) => void;
        setMore: (set: { [K_1 in keyof T]?: T[K_1]["value"] | undefined; }) => void;
        get: <K_2 extends keyof T>(name: K_2) => T[K_2]["value"];
        definition: string;
        dispose: () => void;
    };
  } | null = null;
  lists: Array<any> = [];
  codesysconfig: CodesysConfig;
  values: {config: CodesysValueConfig, valueGroup: ValueGroup}[] = [];
  connected: boolean = false;
    public constructor(private name: string, config: any, private log: LoggingService) {
    this.codesysconfig = new CodesysConfig(config);

    this.values = [];
  }

  async init() {

    return async () => {}
  }

  async addValue(config: any, valueGroup: ValueGroup) : Promise<any> {
    let that = this;
    let knxsub = new CodesysValueConfig(config);
    that.values.push({config: knxsub, valueGroup: valueGroup });
  }
    
  setValue(config: ConnectorConfig, val: ValueGroup, subValue: SubValue, value: any)  {
    let that = this;
    let codesysValueConfig = config as CodesysValueConfig;

    if (config.access[subValue]?.write) {
      if (that.connection) {
      }

    }
  }

  async valuesCreated(values: { [name: string]: ValueGroup; }): Promise<void> {
  }
  async valuesBound(values: { [name: string]: ValueGroup; }): Promise<void> {
    let that = this;

    that.connection = client(that.codesysconfig.ip, that.codesysconfig.port);
  }
}