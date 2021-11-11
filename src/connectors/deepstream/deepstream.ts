import { injectable, inject } from "inversify";
import { DeepstreamClient, DefaultOptions  } from "@deepstream/client";
import { ConnectorConfig, ValueGroup, SubValue, Value } from "../../value";
import { ConfigService } from "../../services/configservice";
//import { DefaultOptions } from "@deepstream/client/dist/client-options";
import { DeepstreamValueConfig } from "./deepstreamvalueconfig";
import { SshRpcService } from "./sshrpcservice";
import { LoggingService, LogLevel } from "../../services/loggingservice";
import { AuthService } from "../../services/authservice";
//import { CONNECTION_STATE } from "@deepstream/client/dist/constants";
import { IConnectorFactory, IConnector } from "../connector";
import { provide } from 'inversify-binding-decorators';
import { NAMED_OBJECTS } from "../../inversify.config";
import { validateOrReject } from "class-validator";
//import { WriteAckCallback } from "@deepstream/client/dist/record/record-core";
import { DH_UNABLE_TO_CHECK_GENERATOR } from "constants";
import { Record } from "@deepstream/client/dist/src/record/record";
import { CONNECTION_STATE } from "@deepstream/client/dist/src/constants";

var colors = require("colors/safe"); // does not alter string prototype
class DeepstreamConfig {
  server: string = '';
  reconnectinterval = 30000;
  //options: Options = DefaultOptions;
  options: any = DefaultOptions;

  public constructor(init?: Partial<DeepstreamConfig>) {
    // We never want to stop trying to reconnect
    (this.options.maxReconnectAttempts = Infinity),
      // @ts-ignore: TS2339
      //this.options.mergeStrategy = deepstream.MERGE_STRATEGIES.LOCAL_WINS;

      Object.assign(this, init);
  }
}

class Rec {
  private valueGroup: ValueGroup;
  private record: Record;
  private recordReady: boolean;
  private connectionReady: boolean;
  private recordInitialized: boolean;
  private recordName: string;
  value: { [subName: string]: Value };
  config: any;
  private readyCallbacks: { (record: Record): void }[] = [];

  constructor(valueGroup: ValueGroup, config: any, client: DeepstreamClient, private logService: LoggingService) {
    let that = this;
    this.value = {};
    this.valueGroup = valueGroup;
    this.config = config;
    this.recordReady = false;
    this.connectionReady = false;
    this.recordInitialized = false;
    this.recordName = valueGroup.nodeId + "/" + valueGroup.fullname;
    this.record = client.record.getRecord(that.recordName);
    this.record.whenReady(record => {
      that.recordReady = true;
      if (that.connectionReady && !that.recordInitialized) {
        that.initRecord(client);
      }
    });
  }

  ///returns the full record name including nodeId
  public getRecordName() {
    return this.recordName;
  }

  public isConnectionReady() {
    return this.connectionReady;
  }
  /// Call when the connection is established to write pending record data
  public setConnectionReady(client: DeepstreamClient) {
    let that = this;
    that.connectionReady = true;
    if (that.recordReady) {
      that.initRecord(client);
    }
  }

  /// called when record is ready and connection is ready to initialize data
  public initRecord(client: DeepstreamClient) {
    let that = this;
    that.recordInitialized = true;
    //that.record.set(SubValue.properties, that.valueGroup.properties as any);
    that.readyCallbacks.forEach(callback => callback(that.record));
    for (let valuekey in that.value) {
      that.record.set(valuekey, that.value[valuekey] as any);
    }
    client.record.getList(that.valueGroup.nodeId).whenReady(list => {
      if (list.getEntries().indexOf(that.recordName) === -1) {
        list.addEntry(that.recordName);
      }
    });
  }

  public waitRecord(callback: (record: Record) => void) {
    if (this.recordReady && this.connectionReady) {
      callback(this.record);
    } else {
      this.readyCallbacks.push(callback);
    }
  }

  public async set(subName: string, value: any): Promise<boolean> {
    if (this.recordReady && this.connectionReady) {
      try {
        this.record.set(subName, value);
        //console.log(`Record set ${this.record.name}/${subName}, ${value}`);
      } catch (e) {
        this.logService.log(LogLevel.error, `ERROR setting ${this.record.name} with subvalue ${subName} to value '${value}': ${JSON.stringify(e, null, 2)}`);
      }
    } else {
      this.value[subName] = value;
      this.logService.log(LogLevel.debug, `cannot set ${this.record.name} with subvalue ${subName} to value '${value}', buffering`);
    }
    return true;
  }
}

// @Service({ id: ConnectorFactoryToken, multiple: true })
@injectable()
export class DeepstreamConnectorFactory implements IConnectorFactory {
  type = 'deepstream';

  constructor(private config: ConfigService, private auth: AuthService, private log: LoggingService) { }

  create(name: string, connectorConfig: DeepstreamConfig): IConnector {
    return new DeepstreamConnector(name, new DeepstreamConfig(connectorConfig), this.config, this.auth, this.log);
  }
}

@injectable()
export class DeepstreamConnector implements IConnector {

  client: DeepstreamClient | null = null;
  records: { [name: string]: Rec } = {};
  sshRpcService: SshRpcService | undefined;

  connected: boolean = false;

  public constructor(
    private name: string,
    private dsconfig: DeepstreamConfig,
    private config: ConfigService,
    private auth: AuthService,
    private logService: LoggingService
  ) {
  }

  async init() {
    let that = this;
    let server: string = that.dsconfig.server;
    that.client = new DeepstreamClient(server, that.dsconfig.options);


    // Login
    let auth = {};
    let token = await that.auth.token();
    if (token) {
      auth = {
        token,
        nodeid: this.config.config.nodeid
      };
    }

    that.client.on("error", function (msg: string, event: string, topic: string) {
      that.logService.log(
        LogLevel.error,
        `Connector '${that.name} ERROR': ${colors.red(msg)}`
      );
    });

    let changeConnectionState = (name: string, connectionState: CONNECTION_STATE) => {
      switch (connectionState) {
        case CONNECTION_STATE.OPEN:
          that.connected = true;
          that.logService.log(
            LogLevel.info,
            `Connector '${name}': ${colors.green("connected")}`
          );

          // provide rpc calls
          that.sshRpcService = new SshRpcService(that.config, that, that.logService);

          // first remove entries and then add them again
          that.client?.record.getList(that.config.config.nodeid).whenReady(list => {
            list.setEntries([]);

            for (let recordname in that.records) {
              if (!that.records[recordname].isConnectionReady()) {
                that.records[recordname].setConnectionReady(that.client as DeepstreamClient);
              }
            }
          });
          break;
        case CONNECTION_STATE.ERROR:
          this.connected = false;
          that.logService.log(
            LogLevel.error,
            `Connector '${name}': ${colors.red(connectionState)}`
          );
          break;
        default:
          this.connected = false;
          that.logService.log(
            LogLevel.warn,
            `Connector '${name}': ${colors.yellow(connectionState)}`
          );
          break;
      }
    };

    changeConnectionState(that.name, that.client.getConnectionState());
    that.client.on("connectionStateChanged", (connectionState: CONNECTION_STATE) => {
      changeConnectionState(that.name, connectionState);
    });

    that.client.login(auth, async function (success: boolean, data) {
      if (success) {
        //that.provideRpcs(that.config.nodeid, that.client, { osinfo: that.sbcservice.staticOsInfoObject} );
      } else {
        that.logService.log(LogLevel.error, "Connection to Deepstream Server failed");
      }
    });
  }

  getRecord(sub: ConnectorConfig, valueGroup: ValueGroup): Rec {
    let that = this;
    if (!that.records[valueGroup.fullNameWithNodeId]) {
      that.logService.log(
        LogLevel.debug,
        `Creating Record '${valueGroup.fullNameWithNodeId}'`
      );
      that.records[valueGroup.fullNameWithNodeId] = new Rec(
        valueGroup,
        sub,
        that.client as DeepstreamClient, // should not be null here, pass with 'as DeepstreamClient' - TODO - find a more elegant way someday
        that.logService
      );
      if (that.connected) {
        that.records[valueGroup.fullNameWithNodeId].setConnectionReady(that.client as DeepstreamClient);
      }
    }
    return that.records[valueGroup.fullNameWithNodeId];
  }

  /**
   * Create values
   * @throws {Error}
  */
  async addValue(config: any, valueGroup: ValueGroup): Promise<any> {
    let that = this;
    let dsValueConfig = new DeepstreamValueConfig(config);

    for (let subValue in valueGroup.values) {

      if (dsValueConfig.access[subValue].write) {
        //validation
        try {
          await validateOrReject(valueGroup.values[subValue].properties);
        }
        catch (e) {
          throw new Error(`Value Properties not set correctly on ${valueGroup.fullname} (${subValue}): ${JSON.stringify(e)}`);
        }

        let rec = that.getRecord(dsValueConfig, valueGroup);
        rec.waitRecord(record => {
          record.subscribe(
            subValue,
            async value => {
              await valueGroup.values[subValue].setValue(value, that.name);
              that.logService.log(
                LogLevel.debug,
                `Target value of ${record.name} (${subValue}) changed to ${value}`
              );
            },
            false
          );
        });
      }
    }

    for (let subValue in valueGroup.values) {
      //set initial state for all defined sub Values
      let value = valueGroup.values[subValue].getValue();
      if (typeof value !== 'undefined') {
        that.getRecord(dsValueConfig, valueGroup)
          .waitRecord(record => record.set(subValue, value));
      }

      //only set record value when read is enabled (read from values that is)
      if (dsValueConfig.access[subValue].read) {
        valueGroup.values[subValue].changed((value: any) => {
          return that.getRecord(dsValueConfig, valueGroup).set(subValue, value);
        }, that.name);
      }
    }
  }

  async setValue(
    config: ConnectorConfig,
    val: ValueGroup,
    subValue: SubValue,
    value: any
  ) {
    let that = this;
    this.getRecord(config, val).set(subValue, value);
  }

  async valuesCreated(values: { [name: string]: ValueGroup; }): Promise<void> {
  }
  async valuesBound(values: { [name: string]: ValueGroup; }): Promise<void> {
  }

}
