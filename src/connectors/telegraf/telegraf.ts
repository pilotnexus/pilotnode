import { injectable, inject } from "inversify";
import * as net from 'net';
import { ConnectorConfig, ValueGroup, SubValue } from '../../value';
import { ConfigService } from '../../services/configservice'
import { LoggingService, LogLevel } from '../../services/loggingservice';
import { IConnectorFactory, IConnector } from '../connector';
import { provide } from 'inversify-binding-decorators';
import { NAMED_OBJECTS } from "../../inversify.config";

class TelegrafConfig {
  socket: string = '/tmp/telegraf.sock';
  reconnectinterval = 30000;

  public constructor(init?: Partial<TelegrafConfig>) {
    Object.assign(this, init);
  }
}

class TelegrafValueConfig extends ConnectorConfig {

  public constructor(init?: Partial<TelegrafValueConfig>) {
    super();
    Object.assign(this, init);

  }
}


@injectable()
export class TelegrafConnectorFactory implements IConnectorFactory {
  type = 'telegraf';
  constructor(private config: ConfigService, private log: LoggingService) {}

  create(name: string, connectorConfig: any) : IConnector {
    return new TelegrafConnector(name, new TelegrafConfig(connectorConfig), this.config, this.log);
  }
}

@injectable()
export class TelegrafConnector implements IConnector {

  nodeid: string;
  client : net.Socket|null = null;

  constructor(private name: string, private tgconfig: TelegrafConfig, private config: ConfigService, private log: LoggingService) {
    this.nodeid = config.config.nodeid;
  }

  async tryinit() {
    let that = this;

    try {
      var client = new net.Socket();

      client.on('error', function (e) {
        that.client = null;

        that.log.log(LogLevel.error, `Connector ${that.name}: Socket error`, e);
      });

      await client.connect(this.tgconfig.socket);
      that.log.log(LogLevel.info, `Connector ${that.name}: Connected to Telegraf Socket`);

      // Add a 'close' event handler for the client socket
      client.on('close', function () {
        that.log.log(LogLevel.error, `Connector ${that.name}: Connection closed`);
      });

      that.client = client;
    }
    catch (e) {
      that.client = null;
      that.log.log(LogLevel.error, `Connector ${that.name}: Could not connect to Telegraf socket`, e);
    }
  }

  async init() {
    let that = this;
   that.tryinit();

    return async () => {
      if (that.client) {
        that.client?.destroy();
      }
    }
  }

  async addValue(config: any, val: ValueGroup) : Promise<any> {
    let that = this;
    let telegraf = new TelegrafValueConfig(config);
    for (let subValue in val.values) {
      val.values[subValue].changed(async (value: any, oldvalue: any) => {
        if (that.client) {
          if (isNaN(value)) {
            if (typeof value === 'string') {
              that.client.write(`${val.path ? val.path : 'root'},node=${that.nodeid} ${val.name}/${subValue}="${value}"\n`);
            }
          } else {
            that.client.write(`${val.path ? val.path : 'root'},node=${that.nodeid} ${val.name}/${subValue}=${value}\n`);
          }
          return true;
        }
        return false;
      }, that.name);
    }

  }

  setValue(config: ConnectorConfig, val: ValueGroup, subValue: SubValue, value: any)  {
    let valueConfig: TelegrafValueConfig = config as TelegrafValueConfig;
  }

  async valuesCreated(values: { [name: string]: ValueGroup; }): Promise<void> {
  }

  async valuesBound(values: { [name: string]: ValueGroup; }): Promise<void> {
  }
}