import { Datapoint } from 'knx';

import { IConnectorBaseConfig, ConnectorConfig } from "../../value";

export enum CodesysType {
  BOOLEAN,
  WORD,
  STRING,
  WSTRING,
  BYTE,
  DWORE,
  TIME,
  REAL,
  LREAL
}

export interface ICodesysValueConfig extends IConnectorBaseConfig {
  index: number;
  codesysType: string;
}

export class CodesysValueConfig extends ConnectorConfig {
  public constructor(init?: Partial<CodesysValueConfig>) {
    super();
    Object.assign(this, init);
  }

}
