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

import { client } from 'netvar';


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

@injectable()
export class CodesysConnector implements IConnector {
  
  connection: any = null;
  codesysconfig: CodesysConfig;
  subs: {config: CodesysValueConfig, valueGroup: ValueGroup}[] = [];
  connected: boolean = false;
    public constructor(private name: string, config: any, private log: LoggingService) {
    this.codesysconfig = new CodesysConfig(config);

    this.subs = [];
  }

  async init() {

    return async () => {}
  }

  initSub(knxSub: CodesysValueConfig, valueGroup: ValueGroup, connection: knx.Connection) {
    let that = this;
    if (knxSub.target_ga) {
      knxSub.target_datapoint = new knx.Datapoint({ga: knxSub.target_ga, dpt: knxSub.dpt}, connection);
        knxSub.target_datapoint.on('change', (oldValue: number, newValue: any) => {
          valueGroup.values[SubValue.targetValue].setValue(newValue, that.name);
        })
        knxSub.target_datapoint.read();
        //knxSub.target_datapoint.read( (src: string, value: any) => {
        //  valueGroup.values[SubValue.targetValue].setValue(value, that.name)
        //});
    }
    
    knxSub.actual_datapoint = new knx.Datapoint({ga: knxSub.actual_ga, dpt: knxSub.dpt}, connection);
      knxSub.actual_datapoint.on('change', (oldValue: number, newValue: any) => {
        valueGroup.values[SubValue.actualValue].setValue(newValue, that.name);
      });

      knxSub.actual_datapoint.read();
      //knxSub.actual_datapoint.read( (src: string, value: any) => {
      //  valueGroup.values[SubValue.actualValue].setValue(value, that.name)
      //});
    knxSub.initialized = true;
  }
    
  async addValue(config: any, valueGroup: ValueGroup) : Promise<any> {
    let that = this;
    let knxsub = new CodesysValueConfig(config);
    that.subs.push({config: knxsub, valueGroup: valueGroup });
    if (that.connected) {
      that.initSub(knxsub, valueGroup, that.connection as knx.Connection); //we know at this point that that.connection is not null, so pass with as knx.Connection, maybe do this nicer one rainy day
    }

      for (let subValue in valueGroup.values) {
      if (knxsub.access[subValue]?.write) {
        valueGroup.values[subValue].changed(async (value: any) => {
          that.setValue(knxsub, valueGroup, subValue as SubValue, value);
          return true; //TODO: currently we don't have any means to check if setValue worked
        }, this.name);
      }
    }

  }
    
  setValue(config: ConnectorConfig, val: ValueGroup, subValue: SubValue, value: any)  {
    let knxValueConfig = config as CodesysValueConfig;

    if (config.access[subValue]?.write) {
      if(subValue === SubValue.targetValue) {
        knxValueConfig.target_datapoint?.write(value);
      } /*else if (subValue === SubValue.actualValue) {
        knxValueConfig.actual_datapoint.write(value);
      } */
    }
  }

  async valuesCreated(values: { [name: string]: ValueGroup; }): Promise<void> {
  }
  async valuesBound(values: { [name: string]: ValueGroup; }): Promise<void> {
    let that = this;

    that.connection = client(that.codesysconfig.ip, that.codesysconfig.port);
  }
}