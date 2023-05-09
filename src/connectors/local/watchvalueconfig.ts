import { Helper } from "../../helper.js";
import { IFileValueConfig } from "./filevalueconfig.js";
import { FileService } from "./fileservice.js";
import { LocalConfig } from "./localconfig.js";

export class WatchValueConfig extends LocalConfig implements IFileValueConfig {
    file: string = '';
    writefile: string = '';
    readretry: number = 3;
    directwrite: boolean = false;
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
