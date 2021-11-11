import { LocalConfig } from "./localconfig";

export enum EmulationType {
  sine = 'sine',
  bit = 'bit'
}

export class EmulationValueConfig extends LocalConfig {
  emutype: EmulationType = EmulationType.sine;
  interval: number = 0;
  period: number = 0;
  
  private _scale: number = 0;
  private _offset: number = 0;

  get scale(): number {
    return this._scale;
  }

  set scale(value: number) {
    this._scale = value;
    this.updateMinMax();
  }

  get offset(): number {
    return this._offset;
  }

  set offset(value: number) {
    this._offset = value;
    this.updateMinMax();
  }

  updateMinMax() {
    //this.minvalue = this.offset - this.scale;
    //this.maxvalue = this.offset + this.scale;
  }

  public constructor(init?: Partial<EmulationValueConfig>) {
    super();
    Object.assign(this, init);

    this.class = 'emulation';
  }
}