export class TelemetryDeviceConfig {
    accesstoken: string = '';
    enablerpc: boolean = false;
}

export class TelemetryConfig {
    server: string = '';
    cache: string = ':memory:';
    devices: {[key: string]: TelemetryDeviceConfig} = {};
  
    public constructor(init?: Partial<TelemetryConfig>) {
      Object.assign(this, init);
    }
}

export enum TelemetryCommand {
  SEND_TELEMETRY,
  RPC,
  LOG
}