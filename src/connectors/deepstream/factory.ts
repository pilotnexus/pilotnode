import { injectable } from "inversify";
import Joi from "joi";
import { AuthService } from "../../services/authservice";
import { ConfigService } from "../../services/configservice";
import { LoggingService } from "../../services/loggingservice";
import { IConnector, IConnectorFactory } from "../connector";
import { DeepstreamConnector } from "./deepstream";
import { DeepstreamConfig } from "./deepstreamconfig";

// @Service({ id: ConnectorFactoryToken, multiple: true })
@injectable()
export class DeepstreamConnectorFactory implements IConnectorFactory {
  type = 'deepstream';

  constructor(private config: ConfigService, private auth: AuthService, private log: LoggingService) { }

  create(name: string, connectorConfig: DeepstreamConfig): IConnector {
    return new DeepstreamConnector(name, new DeepstreamConfig(connectorConfig), this.config, this.auth, this.log);
  }

}
