import { LocalConfig } from "./localconfig.js";
import { ValueGroup } from "./../../value.js";

export class CommandValueConfig extends LocalConfig {
    command: string = '';
    runonstartup: boolean = true;
    interval: number = 60000;
    cron: string = '';
    data: string = '';
    filter: ((input: string, v: ValueGroup) => string | void) | null = null;

    public constructor(init?: Partial<CommandValueConfig>) {
        super();
        this.runonstartup = true;
        Object.assign(this, init);
        this.class = 'command';
    }
}
