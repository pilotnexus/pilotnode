import { injectable, inject } from "inversify";
import { ConfigService } from "./configservice.js";

import { LoggingService, LogLevel } from './loggingservice.js';
import { IConnector, IConnectorFactory } from "../connectors/connector.js";
import { globalContainer, NAMED_OBJECTS } from "../inversify.config.js";
import { LocalConnector, LocalConnectorFactory } from "../connectors/local/local.js";
import { ValueGroup } from "../value.js";

@injectable()
export class ConnectorService {
    public connectors: { [name: string]: IConnector; } = {};
    public autobind: { [key: string]: any } = {};

    constructor(private config: ConfigService, private logService: LoggingService) {
    }

    async init(): Promise<Function> {
        let that = this;
        let terminate: Array<[string, Function]> = [];

        let connectors: any[] = globalContainer.getAll<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR);
        // maps the array to a hashmap, where the connector type ('deepstream', ...) is the key and the factory function create() the value (bound to the factory class)
        let connectorFactories: { [type: string]: (name: string, config: any) => IConnector } = connectors.reduce((map: any, obj: any) => (map[obj.type] = obj.create.bind(obj), map), {});

        // initialize default connectors
        for (const c of connectors) {
            if (c.hasOwnProperty('CONNECTOR_CLASS')) {
                //only add if not configured manually
                if (that.config.config.connectors.filter(cfgconn => cfgconn.type === c.CONNECTOR_CLASS).length === 0) {
                    that.config.config.connectors.push({
                        name: c.CONNECTOR_CLASS,
                        type: c.CONNECTOR_CLASS,
                        config: {},
                        autobind: c.hasOwnProperty('AUTOBIND') ? c.AUTOBIND : undefined
                    });
                }
            }
        }

        // instanciate all connectors
        if (that.config.config.connectors) {
            for (let conn of that.config.config.connectors) {
                if (conn.type in connectorFactories) {
                    that.connectors[conn.name] = connectorFactories[conn.type](conn.name, conn.config ? conn.config : {});
                    terminate.push([conn.name, await that.connectors[conn.name].init()]);

                    if (conn.autobind) {
                        that.autobind[conn.name] = conn.autobind;
                    }
                } else {
                    that.logService.log(LogLevel.error, `Connector '${conn.name}' does not have type specified`);
                }

            }
        }

        return async () => {
            for (let [name, term] of terminate) {
                await term();
                that.logService.log(LogLevel.info, `Connector '${name}' closed`);
            }
        };
    }

    async valuesCreated(values: { [name: string]: ValueGroup }) {
        for (const name in this.connectors) {
            await this.connectors[name].valuesCreated(values);

        }
    }

    async valuesBound(values: { [name: string]: ValueGroup }) {
        for (const name in this.connectors) {
            await this.connectors[name].valuesBound(values);

        }
    }
}
