import { injectable, inject } from "inversify";
import * as knx from 'knx';
import { ConnectorConfig, ValueGroup, SubValue } from '../../value';
import { ConfigService } from '../../services/configservice';
import { KnxValueConfig } from './knxvalueconfig';
import { LoggingService, LogLevel } from '../../services/loggingservice';
import { IConnectorFactory, IConnector } from '../connector';
import { globalContainer } from "../../inversify.config";
import { provide } from 'inversify-binding-decorators';
import { NAMED_OBJECTS } from "../../inversify.config";

var colors = require('colors/safe'); // does not alter string prototype

class KnxConfig {
    ip: string = '';
    port: number = 3671;
    reconnectinterval = 30000;
    debug: boolean = false;
    addr: string = '15.15.0';
  
    public constructor(init?: Partial<KnxConfig>) {
      Object.assign(this, init);
    }
}

@injectable()
export class KnxConnectorFactory implements IConnectorFactory {
  type = 'knx';

  create(name: string, config: any) : IConnector {
    return new KnxConnector(name, config, globalContainer.get(LoggingService));
  }
}

@injectable()
export class KnxConnector implements IConnector {
  connection:knx.Connection|null = null;
  knxconfig: KnxConfig;
  subs: {config: KnxValueConfig, valueGroup: ValueGroup}[] = [];
  connected: boolean;
    public constructor(private name: string, config: any, private log: LoggingService) {
    this.knxconfig = new KnxConfig(config);

    this.connected = false;
    this.subs = [];
  }

  async init() {
    let that = this;

    return async () => {
      if (that.connection) {
        that.connection.Disconnect();
      }
    }
  }

  initSub(knxSub: KnxValueConfig, valueGroup: ValueGroup, connection: knx.Connection) {
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
    let knxsub = new KnxValueConfig(config);
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
    let knxValueConfig = config as KnxValueConfig;

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

    that.connection = new knx.Connection( {
    // ip address and port of the KNX router or interface
    ipAddr: that.knxconfig.ip, ipPort: that.knxconfig.port,
    debug: that.knxconfig.debug,
    physAddr: that.knxconfig.addr,
    minimumDelay: 10,
    handlers: {
      // wait for connection establishment before sending anything!
      connected: function() {
        that.connected = true;
        let sub: KnxValueConfig;
        that.log.log(LogLevel.info, `Connector '${that.name}': ${colors.green('connected')}`);

        for (const ga in that.subs) {
          if (!that.subs[ga].config.initialized) {
            that.initSub(that.subs[ga].config, that.subs[ga].valueGroup, that.connection as knx.Connection);
          }
        }
      },
      //get notified for all KNX events:
      //event: function(evt, src, dest, value) {
      //    that.log.log(LogLevel.info,`${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')} **** KNX EVENT: ${evt}, src: ${src}, dest: ${dest}, value: ${value}`, value);
      //  },
        // get notified on connection errors
        error: function(connstatus: string) {
          that.connected = false;
          that.log.log(LogLevel.error, `Connector '${that.name}': ${colors.red(connstatus)}`);
        }
      }
    });
  }
}