import { injectable } from "inversify";
import Joi from "joi";
import { AuthService } from "../../services/authservice.js";
import { ConfigService } from "../../services/configservice.js";
import { LoggingService } from "../../services/loggingservice.js";
import { IConnector, IConnectorFactory } from "../connector.js";
import { DeepstreamConnector } from "./deepstream.js";
import { DeepstreamConfig } from "./deepstreamconfig.js";

// @Service({ id: ConnectorFactoryToken, multiple: true })
@injectable()
export class DeepstreamConnectorFactory implements IConnectorFactory {
    type = 'deepstream';

    constructor(private config: ConfigService, private auth: AuthService, private log: LoggingService) { }

    create(name: string, connectorConfig: DeepstreamConfig): IConnector {
        return new DeepstreamConnector(name, new DeepstreamConfig(connectorConfig), this.config, this.auth, this.log);
    }

}
