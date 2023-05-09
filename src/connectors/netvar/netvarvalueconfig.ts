import { IConnectorBaseConfig, ConnectorConfig } from "../../value.js";

export enum NetvarType {
    BOOLEAN,
    WORD,
    STRING,
    WSTRING,
    BYTE,
    DWORD,
    TIME,
    REAL,
    LREAL
}

export interface INetvarValueConfig extends IConnectorBaseConfig {
    index: number;
    type: string;
}

export class NetvarValueConfig extends ConnectorConfig {

    index: number = 0;
    type: string = '';
    public constructor(init?: Partial<NetvarValueConfig>) {
        super();
        Object.assign(this, init);
    }

}
