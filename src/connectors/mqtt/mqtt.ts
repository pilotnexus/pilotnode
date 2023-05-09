import { injectable, inject } from "inversify";
import { provide } from 'inversify-binding-decorators';
import { ConnectorConfig, ValueGroup, SubValue, Value } from "../../value.js";
import { ConfigService } from "../../services/configservice.js";
import { LoggingService, LogLevel } from "../../services/loggingservice.js";
import { AuthService } from "../../services/authservice.js";
import { IConnectorFactory, IConnector } from "../connector.js";
import { NAMED_OBJECTS } from "../../inversify.config.js";

import { validateOrReject } from "class-validator";
import { DH_UNABLE_TO_CHECK_GENERATOR } from "constants";
import mqtt from 'mqtt';
import { client } from "netvar";
import chalk from "chalk";

class MqttConfig {
    server: string = '';
    options: mqtt.IClientOptions | undefined;

    public constructor(init?: Partial<MqttConfig>) {
        // We never want to stop trying to reconnect

        Object.assign(this, init);
    }
}

class MqttRec {
    public valueGroup: ValueGroup;
    private client: mqtt.MqttClient;
    private recordReady: boolean;
    private connectionReady: boolean;
    private recordInitialized: boolean;
    public recordName: string;
    value: { [subName: string]: Value };
    config: any;
    private readyCallbacks: { (record: MqttRec): void }[] = [];

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
        that.initRecord();
    }

    ///returns the full record name including nodeId
    public getRecordName() {
        return this.recordName;
    }

    public isConnectionReady() {
        return this.connectionReady;
    }
    /// Call when the connection is established to write pending record data
    public setConnectionReady() {
        let that = this;
        that.connectionReady = true;
        if (that.recordReady) {
            that.initRecord();
        }
    }

    /// called when record is ready and connection is ready to initialize data
    public initRecord() {
        let that = this;
        that.recordInitialized = true;
        that.readyCallbacks.forEach(callback => callback(that));
        for (let valuekey in that.value) {
            that.set(valuekey, that.value[valuekey] as any);
        }
    }

    public waitRecord(callback: (record: MqttRec) => void) {
        if (this.recordReady && this.connectionReady) {
            callback(this);
        } else {
            this.readyCallbacks.push(callback);
        }
    }

    public async set(subName: string, value: any): Promise<boolean> {
        if (this.recordReady && this.connectionReady) {
            try {
                this.client.publish(this.recordName + '/' + subName, JSON.stringify(value));
                this.logService.log(LogLevel.debug, `Record set ${this.recordName}/${subName}, ${value}`);
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
        private mqttConfig: MqttConfig,
        private config: ConfigService,
        private auth: AuthService,
        private logService: LoggingService
    ) {
    }

    async init() {
        let that = this;
        let server: string = that.mqttConfig.server;

        that.client = mqtt.connect(server, that.mqttConfig.options);

        that.client.on('connect', function() {
            that.connected = true;
            that.logService.log(
                LogLevel.info,
                `Connector '${that.name}': ${chalk.green("connected")}`
            );
            for (let recordname in that.records) {
                if (!that.records[recordname].isConnectionReady()) {
                    that.records[recordname].setConnectionReady();
                }
            }
        });

        that.client.on("error", function(msg: string, event: string, topic: string) {
            that.logService.log(
                LogLevel.error,
                `Connector '${that.name} ERROR': ${chalk.red(msg)}`
            );
        });

        that.client.handleMessage = (packet: mqtt.Packet, callback) => {
            let handled = false;
            if ('topic' in packet && 'payload' in packet) {
                try {
                    let idx = packet.topic.lastIndexOf('/');
                    if (idx != -1) {
                        let name = packet.topic.substring(0, idx);
                        let subValue = packet.topic.substring(idx + 1);
                        if (name in that.records && subValue in that.records[name].valueGroup.values) {
                            let rec = that.records[name].valueGroup.values[subValue];
                            let value = JSON.parse(packet.payload.toString());
                            rec.setValue(value, that.name);
                            handled = true;
                            LogLevel.debug,
                                `Target value of ${name} (${subValue}) changed to ${value}`
                        }
                    }
                }
                catch { }
            }

            callback(); //TODO, use handled and set error accordingly
        };

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
                that.records[valueGroup.fullNameWithNodeId].setConnectionReady();
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
                let topic = `${rec.recordName}/${subValue}`;
                that.client?.subscribe(topic, async function(err: any, topic: any) {
                    if (err) {
                        that.logService.log(LogLevel.error, `Cannot subscribe to topic ${topic}`);
                        that.logService.log(LogLevel.error, JSON.stringify(err));
                    }
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
