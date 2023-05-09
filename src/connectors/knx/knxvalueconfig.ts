import { Datapoint } from 'knx';

import { IConnectorBaseConfig, ConnectorConfig } from "../../value.js";


export interface IKnxValueConfig extends IConnectorBaseConfig {
    target_ga: string;
    actual_ga: string;
    dpt: string;
    interval: number;
    initialized: boolean;

    target_datapoint: Datapoint;
    actual_datapoint: Datapoint;
}

export class KnxValueConfig extends ConnectorConfig {
    target_ga: string = '';
    actual_ga: string = '';
    dpt: string = '';
    interval: number = 60000;
    initialized: boolean = false;

    target_datapoint: Datapoint | null = null;
    actual_datapoint: Datapoint | null = null;

    public constructor(init?: Partial<KnxValueConfig>) {
        super();
        Object.assign(this, init);
        this.initialized = false;
    }

}
