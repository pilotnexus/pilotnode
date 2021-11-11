import { IFileValueConfig } from "./filevalueconfig";
import { Helper } from "../../helper";
import { FileService } from "./fileservice";
import { LocalConfig } from "./localconfig";

export class WatchValueConfig extends LocalConfig implements IFileValueConfig {
  file: string = '';
  writefile: string = '';
  monitorTimeout: number = 0;
  data: Buffer = Buffer.from('');
  epoll: Boolean;

  public constructor(init?: Partial<WatchValueConfig>) {
    super();
    this.epoll = true;
    Object.assign(this, init);
    this.class = 'watch';
  }
}
