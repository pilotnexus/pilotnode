import { IConnectorBaseConfig, ConnectorConfig, SubValue, ValueGroup } from "../../value";

export interface ITelemetryValueConfig extends IConnectorBaseConfig {
}

export class TelemetryValueConfig extends ConnectorConfig {
  public constructor(public accesstoken: string, public map: {[key: string]: string}, public valueGroup: ValueGroup) {
    super();
  }
}