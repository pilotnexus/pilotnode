import { FileService } from "./fileservice";
import { ILocalConfig, LocalConfig } from "./localconfig";
import { ValueGroup } from "./../../value";

export interface IFileValueConfig extends ILocalConfig {
  file: string;
  writefile: string;
  monitorTimeout: number;

}

export class FileValueConfig extends LocalConfig {
  file: string = '';
  writefile: string = '';
  monitorTimeout: number = 0;
  interval: number = 0;
  data: string = '';
  filter: ((input: string, v: ValueGroup) => string|void)|null = null;

  public constructor(init?: Partial<FileValueConfig>) {
    super();
    this.monitorTimeout = 0;
    Object.assign(this, init);
    this.class = 'file';
  }
}
