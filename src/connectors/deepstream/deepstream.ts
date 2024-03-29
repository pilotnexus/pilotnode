import { injectable, inject } from "inversify";
import { validateOrReject } from "class-validator";
import { DeepstreamClient } from "@deepstream/client";
import { ConnectorConfig, ValueGroup, SubValue } from "../../value.js";
import { ConfigService } from "../../services/configservice.js";
import { DeepstreamValueConfig } from "./deepstreamvalueconfig.js";
import { SshRpcService } from "./sshrpcservice.js";
import { LoggingService } from "../../services/loggingservice.js";
import { AuthService } from "../../services/authservice.js";
import { IConnectorFactory, IConnector } from "../connector.js";
import { CONNECTION_STATE } from "@deepstream/client/dist/src/constants.js";
import { Rec } from "./deepstreamrec.js";
import { DeepstreamConfig } from "./deepstreamconfig.js";

import Joi from "joi";
import chalk from "chalk";


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

        that.client.on("error", function(msg: string, event: string, topic: string) {
            that.logService.logger.error(`Connector '${that.name} ERROR': ${chalk.red(msg)}`);
        });

        let changeConnectionState = (name: string, connectionState: CONNECTION_STATE) => {
            switch (connectionState) {
                case CONNECTION_STATE.OPEN:
                    that.connected = true;
                    that.logService.logger.info(`Connector '${name}': ${chalk.green("connected")}`
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
                    that.logService.logger.error(`Connector '${name}': ${chalk.red(connectionState)}`);
                    break;
                default:
                    this.connected = false;
                    that.logService.logger.warn(`Connector '${name}': ${chalk.yellow(connectionState)}`);
                    break;
            }
        };

        changeConnectionState(that.name, that.client.getConnectionState());
        that.client.on("connectionStateChanged", (connectionState: CONNECTION_STATE) => {
            changeConnectionState(that.name, connectionState);
        });

        that.client.login(auth, async function(success: boolean, data) {
            if (success) {
                //that.provideRpcs(that.config.nodeid, that.client, { osinfo: that.sbcservice.staticOsInfoObject} );
            } else {
                that.logService.logger.error("Connection to Deepstream Server failed");
            }
        });

        return async () => {
            if (that.client) {
                that.client.close();
            }
        }
    }

    getRecord(sub: ConnectorConfig, valueGroup: ValueGroup): Rec {
        let that = this;
        if (!that.records[valueGroup.fullNameWithNodeId]) {
            that.logService.logger.debug(`Creating Record '${valueGroup.fullNameWithNodeId}'`);
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
                            that.logService.logger.debug(`Target value of ${record.name} (${subValue}) changed to ${value}`);
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
