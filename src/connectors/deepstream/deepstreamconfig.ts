import pkg from '@deepstream/client';
const { DefaultOptions } = pkg;
//import { DefaultOptions } from "@deepstream/client";

export class DeepstreamConfig {
    server: string = '';
    reconnectinterval = 30000;
    //options: Options = DefaultOptions;
    options: any = DefaultOptions;

    public constructor(init?: Partial<DeepstreamConfig>) {
        // We never want to stop trying to reconnect
        (this.options.maxReconnectAttempts = Infinity),
            // @ts-ignore: TS2339
            //this.options.mergeStrategy = deepstream.MERGE_STRATEGIES.LOCAL_WINS;

            Object.assign(this, init);
    }
}
