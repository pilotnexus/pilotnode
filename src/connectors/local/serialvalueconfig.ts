import { ConnectorConfig } from "../../value.js";
import { LocalConfig } from "./localconfig.js";

export class SerialValueConfig extends LocalConfig {
    port: string = '';
    baudrate: number = 9600;
    databits: number = 8;
    stopbits: number = 1;
    parity: Parity = Parity.None;

    public constructor(init?: Partial<SerialValueConfig>) {
        super();
        this.baudrate = 9600;
        Object.assign(this, init);
        this.class = 'serial';
    }
}

export enum Parity {
    None = "none",
    Even = "even",
    Odd = "Odd"
};
