import { injectable, inject } from "inversify";
import { ConnectorConfig, ValueGroup, SubValue, Value } from "../../value";
import { ConfigService } from "../../services/configservice";
import { LoggingService, LogLevel } from "../../services/loggingservice";
import { AuthService } from "../../services/authservice";
import { IConnectorFactory, IConnector } from "../connector";
import { provide } from 'inversify-binding-decorators';
import { NAMED_OBJECTS } from "../../inversify.config";
import { validateOrReject } from "class-validator";
//import { WriteAckCallback } from "@deepstream/client/dist/record/record-core";
import { DH_UNABLE_TO_CHECK_GENERATOR } from "constants";
import { CONNECTION_STATE } from "@deepstream/client/dist/src/constants";
import mqtt from 'mqtt';

var colors = require("colors/safe"); // does not alter string prototype
class MqttConfig {
  server: string = '';
  reconnectinterval = 30000;
  //options: Options = DefaultOptions;

  public constructor(init?: Partial<MqttConfig>) {
    // We never want to stop trying to reconnect

      Object.assign(this, init);
  }
}

class MqttRec {
  private valueGroup: ValueGroup;
  private client: mqtt.MqttClient;
  private recordReady: boolean;
  private connectionReady: boolean;
  private recordInitialized: boolean;
  public recordName: string;
  value: { [subName: string]: Value };
  config: any;
  private readyCallbacks: { (client: mqtt.Client): void }[] = [];

  constructor(valueGroup: ValueGroup, config: any, client: mqtt.Client, private logService: LoggingService) {
    let that = this;
    this.client = client;
    this.value = {};
    this.valueGroup = valueGroup;
    this.config = config;
    this.recordReady = false;
    this.connectionReady = false;
    this.recordInitialized = false;
    this.recordName = valueGroup.nodeId + "/" + valueGroup.fullname;
    that.recordReady = true;
    that.initRecord(client);
  }

  ///returns the full record name including nodeId
  public getRecordName() {
    return this.recordName;
  }

  public isConnectionReady() {
    return this.connectionReady;
  }
  /// Call when the connection is established to write pending record data
  public setConnectionReady(client: mqtt.MqttClient) {
    let that = this;
    that.connectionReady = true;
    if (that.recordReady) {
      that.initRecord(client);
    }
  }

  /// called when record is ready and connection is ready to initialize data
  public initRecord(client: mqtt.MqttClient) {
    let that = this;
    that.recordInitialized = true;
    //that.record.set(SubValue.properties, that.valueGroup.properties as any);
    that.readyCallbacks.forEach(callback => callback(that.client));
    for (let valuekey in that.value) {
      //that.record.set(valuekey, that.value[valuekey] as any);
    }
  }

  public waitRecord(callback: (client: mqtt.Client) => void) {
    if (this.recordReady && this.connectionReady) {
      callback(this.client);
    } else {
      this.readyCallbacks.push(callback);
    }
  }

  public async set(subName: string, value: any): Promise<boolean> {
    if (this.recordReady && this.connectionReady) {
      try {
        this.client.emit(this.recordName + '/' + subName, value);
        //console.log(`Record set ${this.record.name}/${subName}, ${value}`);
      } catch (e) {
        this.logService.log(LogLevel.error, `ERROR setting ${this.recordName} with subvalue ${subName} to value '${value}': ${JSON.stringify(e, null, 2)}`);
      }
    } else {
      this.value[subName] = value;
      this.logService.log(LogLevel.debug, `cannot set ${this.recordName} with subvalue ${subName} to value '${value}', buffering`);
    }
    return true;
  }
}

// @Service({ id: ConnectorFactoryToken, multiple: true })
@injectable()
export class MqttConnectorFactory implements IConnectorFactory {
  type = 'mqtt';

  constructor(private config: ConfigService, private auth: AuthService, private log: LoggingService) { }

  create(name: string, connectorConfig: MqttConfig): IConnector {
    return new MqttConnector(name, new MqttConfig(connectorConfig), this.config, this.auth, this.log);
  }
}

@injectable()
export class MqttConnector implements IConnector {

  client: mqtt.MqttClient | null = null;
  records: { [name: string]: MqttRec } = {};

  connected: boolean = false;

  public constructor(
    private name: string,
    private dsconfig: MqttConfig,
    private config: ConfigService,
    private auth: AuthService,
    private logService: LoggingService
  ) {
  }

  async init() {
    let that = this;
    let server: string = that.dsconfig.server;

    that.client = mqtt.connect('mqtt://test.mosquitto.org');

    that.client.on('connect', function () {
      that.connected = true;
      that.logService.log(
        LogLevel.info,
        `Connector '${name}': ${colors.green("connected")}`
      );
    });
    

    // Login
    //let auth = {};
    //let token = await that.auth.token();
    //if (token) {
    //  auth = {
    //    token,
    //    nodeid: this.config.config.nodeid
    //  };
    //}

    that.client.on("error", function (msg: string, event: string, topic: string) {
      that.logService.log(
        LogLevel.error,
        `Connector '${that.name} ERROR': ${colors.red(msg)}`
      );
    });

    //that.client.login(auth, async function (success: boolean, data: any) {
    //  if (success) {
    //    //that.provideRpcs(that.config.nodeid, that.client, { osinfo: that.sbcservice.staticOsInfoObject} );
    //  } else {
    //    that.logService.log(LogLevel.error, "Connection to Deepstream Server failed");
    //  }
    //});

    return async () => {
      if (that.client) {
        that.client.end(true);
      }
    }
  }

  getRecord(sub: ConnectorConfig, valueGroup: ValueGroup): MqttRec {
    let that = this;
    if (!that.records[valueGroup.fullNameWithNodeId]) {
      that.logService.log(
        LogLevel.debug,
        `Creating Record '${valueGroup.fullNameWithNodeId}'`
      );
      that.records[valueGroup.fullNameWithNodeId] = new MqttRec(
        valueGroup,
        sub,
        that.client as mqtt.Client, // should not be null here, pass with 'as DeepstreamClient' - TODO - find a more elegant way someday
        that.logService
      );
      if (that.connected) {
        that.records[valueGroup.fullNameWithNodeId].setConnectionReady(that.client as mqtt.Client);
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
    //let dsValueConfig = new DeepstreamValueConfig(config);
    let dsValueConfig = config;

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
        that.client?.on(rec.recordName, async function (topic: any, value: any) {
              await valueGroup.values[subValue].setValue(value, that.name);
              that.logService.log(
                LogLevel.debug,
                `Target value of ${rec.recordName} (${subValue}) changed to ${value}`
              );
            },
          );
        };
      }

    for (let subValue in valueGroup.values) {
      //set initial state for all defined sub Values
      let value = valueGroup.values[subValue].getValue();
      if (typeof value !== 'undefined') {
        //that.getRecord(dsValueConfig, valueGroup)
        //  .waitRecord(record => record.set(subValue, value));
      }

      //only set record value when read is enabled (read from values that is)
      if (dsValueConfig.access[subValue].read) {
        valueGroup.values[subValue].changed((value: any, oldvalue: any) => {
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
