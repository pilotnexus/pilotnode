import { ConnectorConfig, IConnectorBaseConfig } from '../../value.js';
import { PilotServiceConfig } from './pilotservice.js';

export class LocalConfig extends ConnectorConfig {
    class: string = '';
    pilotservice: PilotServiceConfig;

    public constructor(init?: Partial<LocalConfig>) {
        super();
        Object.assign(this, init);

        if (init?.pilotservice) {
            this.pilotservice = new PilotServiceConfig(init.pilotservice);
        } else {
            this.pilotservice = new PilotServiceConfig();
        }
    }
}
export interface ILocalConfig extends IConnectorBaseConfig {
    class: string;
}
