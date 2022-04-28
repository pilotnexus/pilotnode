import { FileService } from "./fileservice";
import { ILocalConfig, LocalConfig } from "./localconfig";
import { ValueGroup } from "./../../value";

export interface IFileValueConfig extends ILocalConfig {
  /// file to read/write
  file: string;
  /// use if write should go to a different file
  writefile: string;
  /// if true, writing immediately sets actualValue
  /// if false, actualValue is updated after write success
  directwrite: boolean;
  monitorTimeout: number;
}

export class FileValueConfig extends LocalConfig {
  file: string = '';
  writefile: string = '';
  directwrite: boolean = false;
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
