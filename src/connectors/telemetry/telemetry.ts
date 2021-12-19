import { ConfigService } from "../../services/configservice";
import { injectable } from "inversify";
import { IConnectorFactory, IConnector } from "../connector";
import { LoggingService, LogLevel } from "../../services/loggingservice";
import { ValueGroup } from "../../value";
import { ConnectorConfig } from "../../value";
import { SubValue } from "../../value";
import { TelemetryCommand, TelemetryConfig } from "./telemetryconfig";
import { TelemetryValueConfig } from "./telemetryvalueconfig";

import { resolve } from 'path';
import { Worker } from 'worker_threads';
import { Fact } from "json-rules-engine";
import { ApiService } from "../../services/apiservice";
import { RpcService } from "../../services/rpcservice";

 @injectable()
 export class TelemetryConnectorFactory implements IConnectorFactory {
  type = 'telemetry';

  constructor(private config: ConfigService, private apiService: ApiService, private log: LoggingService, private rpcService: RpcService) {}

  create(name: string, connectorConfig: any): IConnector {
    return new TelemetryConnector(name, new TelemetryConfig(connectorConfig), this.apiService, this.log, this.rpcService);
  }
}

interface ITelemetry {
  addTelemetryValueConfig(cfg: any): void;
  sendTelemetryData(accesstoken: string, ts: number, key: string, value: any): Promise<boolean>;
}

@injectable()
export class TelemetryConnector implements IConnector {

  terminate: Function | null = null;
  telemetryValues: {[key: string]: TelemetryValueConfig} = {};
  telemetry: ITelemetry | null = null;

  public constructor(
    private name: string,
    private config: TelemetryConfig,
    private apiService: ApiService,
    private logService: LoggingService,
    private rpcService: RpcService
  ) {
  }

  async init() {
    let that = this;

    return async () => {
      if (that.terminate) {
        that.terminate();
        that.logService.log(LogLevel.info, "Telegraf Connector closed.");
      }
    }
  }

  async runService(config: any) : Promise<ITelemetry> {
    let that = this;
    const worker = new Worker(resolve(__dirname, 'telemetryworker.js'), {
      workerData: config
    });

    that.terminate = worker.terminate;

    worker.on('message', async (result: any) => {
      try {
        switch (result.cmd) {
          case TelemetryCommand.LOG:
            this.logService.log(result.logLevel, `Telemetry worker: ${result.message}`);
            break;
          case TelemetryCommand.RPC:
            if('response' in result && 'id' in result.response && 'method' in result.response && 'accesstoken' in result) {
              //this.logService.log(LogLevel.info, `Telemetry worker: RPC ${JSON.stringify(result.response)}`);
              let response = await this.rpcService.call(result.response.method, result.response.params );
              //this.logService.log(LogLevel.info, `RPC result is ${JSON.stringify(response)}`);
              worker.postMessage({cmd: TelemetryCommand.RPC, data: { id: result.response.id, accesstoken: result.accesstoken, response }})
            } else {
              this.logService.log(LogLevel.error, `Telemetry worker: malformed RPC message ${JSON.stringify(result.response)}`);
            }
          break;
        }
      }
      catch(e) {
        this.logService.log(result.logLevel, "Telemetry message exception: ", JSON.stringify(e));
      }
    });

    worker.on('error', (err: Error) => {
      this.logService.log(LogLevel.error, "Telemetry worker error: ", err.toString());
    });
    
    worker.on('exit', (code) => {
      this.logService.log(LogLevel.error, 'Telemetry worker thread stopped');
    });

    return {
      addTelemetryValueConfig: config => worker.postMessage( { config }),
      sendTelemetryData: async (accesstoken: string, ts: number, key: string, value: any): Promise<boolean> => {
        try {
          worker.postMessage( { cmd: TelemetryCommand.SEND_TELEMETRY, 
            accesstoken, 
            data: { ts, values: {[key]: value }}});
          return true;
        } catch {}
        return false;
      }
    } 
  }

  async valuesCreated(values: { [name: string]: ValueGroup; }): Promise<void> {
  }

  async valuesBound(values: { [name: string]: ValueGroup; }): Promise<void> {
    let that = this;
    that.telemetry = await this.runService(this.config);
  }

  async addValue(config: any, val: ValueGroup): Promise<any> {
    let that = this;
    for (var device in config) 
    {
      if (device in this.config.devices)
      {
        let ruleValueConfig = new TelemetryValueConfig(this.config.devices[device].accesstoken, config[device], val);
        this.telemetryValues[val.fullNameWithNodeId] = ruleValueConfig;

        for (let subValue in val.values) {
          if (subValue in ruleValueConfig.map) {
            val.values[subValue].changed( async (value: any) => {
              let result = await this.telemetry?.sendTelemetryData(this.telemetryValues[val.fullNameWithNodeId].accesstoken, 
                Date.now(),
                this.telemetryValues[val.fullNameWithNodeId].map[subValue],
                value);
              return result ? true : false;
            }, that.name);
          }
        }
      }
    }
  }

  setValue(config: ConnectorConfig, valueGroup: ValueGroup, subValue: SubValue, value: any): void {
  }
}