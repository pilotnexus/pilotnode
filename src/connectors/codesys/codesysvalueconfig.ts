import { Datapoint } from 'knx';

import { IConnectorBaseConfig, ConnectorConfig } from "../../value";


export interface ICodesysValueConfig extends IConnectorBaseConfig {
  target_ga: string;
  actual_ga: string;
  dpt: string;
  interval: number;
  initialized: boolean;

  target_datapoint: Datapoint;
  actual_datapoint: Datapoint;
}

export class CodesysValueConfig extends ConnectorConfig {
  target_ga: string = '';
  actual_ga: string = '';
  dpt: string = '';
  interval: number = 60000;
  initialized: boolean = false;

  target_datapoint: Datapoint|null = null;
  actual_datapoint: Datapoint|null = null;

  public constructor(init?: Partial<CodesysValueConfig>) {
    super();
    Object.assign(this, init);
    this.initialized = false;
  }

}
