
import { IConnectorBaseConfig, ConnectorConfig } from "../../value.js";


export interface IDeepstreamValueConfig extends IConnectorBaseConfig {
}

export class DeepstreamValueConfig extends ConnectorConfig {

    public constructor(init?: Partial<DeepstreamValueConfig>) {
        super();
        Object.assign(this, init);
    }

}
