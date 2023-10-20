import { DeepstreamClient } from "@deepstream/client";
import { Record } from "@deepstream/client/dist/src/record/record.js";
import { LoggingService } from "../../services/loggingservice.js";
import { ConnectorConfig, ValueGroup, SubValue, Value } from "../../value.js";

export class Rec {
    private valueGroup: ValueGroup;
    private record: Record;
    private recordReady: boolean;
    private connectionReady: boolean;
    private recordInitialized: boolean;
    private recordName: string;
    value: { [subName: string]: Value };
    config: any;
    private readyCallbacks: { (record: Record): void }[] = [];

    constructor(valueGroup: ValueGroup, config: any, client: DeepstreamClient, private logService: LoggingService) {
        let that = this;
        this.value = {};
        this.valueGroup = valueGroup;
        this.config = config;
        this.recordReady = false;
        this.connectionReady = false;
        this.recordInitialized = false;
        this.recordName = valueGroup.nodeId + "/" + valueGroup.fullname;
        this.record = client.record.getRecord(that.recordName);
        this.record.whenReady(record => {
            that.recordReady = true;
            if (that.connectionReady && !that.recordInitialized) {
                that.initRecord(client);
            }
        });
    }

    ///returns the full record name including nodeId
    public getRecordName() {
        return this.recordName;
    }

    public isConnectionReady() {
        return this.connectionReady;
    }
    /// Call when the connection is established to write pending record data
    public setConnectionReady(client: DeepstreamClient) {
        let that = this;
        that.connectionReady = true;
        if (that.recordReady) {
            that.initRecord(client);
        }
    }

    /// called when record is ready and connection is ready to initialize data
    public initRecord(client: DeepstreamClient) {
        let that = this;
        that.recordInitialized = true;
        //that.record.set(SubValue.properties, that.valueGroup.properties as any);
        that.readyCallbacks.forEach(callback => callback(that.record));
        for (let valuekey in that.value) {
            that.record.set(valuekey, that.value[valuekey] as any);
        }
        client.record.getList(that.valueGroup.nodeId).whenReady(list => {
            if (list.getEntries().indexOf(that.recordName) === -1) {
                list.addEntry(that.recordName);
            }
        });
    }

    public waitRecord(callback: (record: Record) => void) {
        if (this.recordReady && this.connectionReady) {
            callback(this.record);
        } else {
            this.readyCallbacks.push(callback);
        }
    }

    public async set(subName: string, value: any): Promise<boolean> {
        if (this.recordReady && this.connectionReady) {
            try {
                this.record.set(subName, value);
                //console.log(`Record set ${this.record.name}/${subName}, ${value}`);
            } catch (e) {
                this.logService.logger.error(`ERROR setting ${this.record.name} with subvalue ${subName} to value '${value}': ${JSON.stringify(e, null, 2)}`);
            }
        } else {
            this.value[subName] = value;
            this.logService.logger.debug(`cannot set ${this.record.name} with subvalue ${subName} to value '${value}', buffering`);
        }
        return true;
    }
}
