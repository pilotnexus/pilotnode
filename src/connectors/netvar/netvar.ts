import { injectable, inject } from "inversify";
import * as knx from 'knx';
import { ConnectorConfig, ValueGroup, SubValue } from '../../value';
import { ConfigService } from '../../services/configservice';
import { NetvarValueConfig as NetvarValueConfig } from './netvarvalueconfig';
import { LoggingService, LogLevel } from '../../services/loggingservice';
import { IConnectorFactory, IConnector } from '../connector';
import { globalContainer } from "../../inversify.config";
import { provide } from 'inversify-binding-decorators';
import { NAMED_OBJECTS } from "../../inversify.config";

import { client, Options, t } from 'netvar';
import { Types } from "netvar/dist/types";
import { types } from "joi";


var colors = require('colors/safe'); // does not alter string prototype

class NetvarConfig {
    ip: string = '';
    port: number = 1202;
    debug: boolean = false;
  
    public constructor(init?: Partial<NetvarConfig>) {
      Object.assign(this, init);
    }
}

@injectable()
export class NetvarConnectorFactory implements IConnectorFactory {
  type = 'netvar';

  create(name: string, config: any) : IConnector {
    return new NetvarConnector(name, config, globalContainer.get(LoggingService));
  }
}

interface IList {
  set(name: string): void;
}

@injectable()
export class NetvarConnector implements IConnector {
  
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
  list: any = {};
  netvarconfig: NetvarConfig;
  values: {config: NetvarValueConfig, valueGroup: ValueGroup}[] = [];
  connected: boolean = false;
    public constructor(private name: string, config: any, private log: LoggingService) {
    this.netvarconfig = new NetvarConfig(config);

    this.values = [];
  }

  async init() {

    return async () => {}
  }

  async addValue(config: any, valueGroup: ValueGroup) : Promise<any> {
    let that = this;
    let netvarsub = new NetvarValueConfig(config);
    that.values.push({config: netvarsub, valueGroup: valueGroup });

    for (let subValue in valueGroup.values) {
      if (netvarsub.access[subValue]?.write) {
        valueGroup.values[subValue].changed(async (value: any) => {
          that.setValue(netvarsub, valueGroup, subValue as SubValue, value);
          return true; //TODO: currently we don't have any means to check if setValue worked
        }, this.name);
      }
    }
  }
    
  setValue(config: ConnectorConfig, val: ValueGroup, subValue: SubValue, value: any)  {
    let that = this;
    let netvarValueConfig = config as NetvarValueConfig;

    if (that.connection && that.list) {
      that.list.set(val.fullname, value);
    }
  }

  async valuesCreated(values: { [name: string]: ValueGroup; }): Promise<void> {

  }

  async valuesBound(values: { [name: string]: ValueGroup; }): Promise<void> {
    let that = this;

    let dataObj: any = {};
    that.values

    for (let i=0; i<that.values.length; i++) {
      let value = that.values[i].valueGroup.fullname;
      let idx = that.values[i].config.index;
      let ty = undefined;
      switch(that.values[i].config.type.toUpperCase()) {
        case 'BOOLEAN': dataObj[value] = t.boolean(idx); break;
        case 'WORD': dataObj[value] = t.word(idx); break;
        case 'STRING': dataObj[value] = t.string(idx); break;
        case 'WSTRING': dataObj[value] = t.wString(idx); break;
        case 'BYTE': dataObj[value] = t.byte(idx); break;
        case 'DWORE': dataObj[value] = t.dWore(idx); break;
        case 'TIME': dataObj[value] = t.time(idx); break;
        case 'REAL': dataObj[value] = t.real(idx); break;
        case 'LREAL': dataObj[value] = t.lReal(idx); break;
      }
    }

    that.connection = client(that.netvarconfig.ip, that.netvarconfig.port);
    that.list = that.connection.openList(
      {listId: 1,
        onChange: (name, value) => {
          console.log(`netvar value changed: ${name}: ${value}`);
          if (name in values) {
            values[name].values['targetValue'].setValue(value, this.name);
          }
        },
        cyclic: true,
        cycleInterval: 2000,
      },
      dataObj
    )
  }
}