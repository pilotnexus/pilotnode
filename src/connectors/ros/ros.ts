//@ts-ignore
import { injectable } from 'inversify';
import { IConnector, IConnectorFactory } from '../connector.js';
import { ValueGroup, SubValue, ConnectorConfig, Value } from '../../value.js';
import { globalContainer } from "../../inversify.config.js";
import { LoggingService, LogLevel } from '../../services/loggingservice.js';
import { DH_UNABLE_TO_CHECK_GENERATOR } from 'constants';
import chalk from "chalk";

class RosSubscription {
    topic: string = '';
    type: string = '';
    value: any = {};
    callbacks: any[] = [];

    public constructor(init?: Partial<RosSubscription>) {
        Object.assign(this, init);
    }
}

class RosConfig {
    nodeName: string = '/pilotnode';
    subscriptions: RosSubscription[] = [];
    cmake_prefix_path: string = '';
    anonymous: boolean = true;
    rosMasterUri: string = 'http://localhost:11311/';
    timeout: number = 10000;
    public constructor(init?: Partial<RosConfig>) {
        Object.assign(this, init);

        if (init?.subscriptions) {
            this.subscriptions = [];
            init.subscriptions.forEach(sub => this.subscriptions.push(new RosSubscription(sub)));
        }
    }
}
class RosValueConfig {
    public constructor(init?: Partial<RosValueConfig>) {
        Object.assign(this, init);
    }

}

@injectable()
export class RosConnectorFactory implements IConnectorFactory {
    type = 'ros';

    create(name: string, config: any): IConnector {
        return new RosConnector(name, config, globalContainer.get(LoggingService));
    }
}

export class RosConnector implements IConnector {

    rosConfig: RosConfig;

    /**
     *
     */
    constructor(private name: string, config: any, private logService: LoggingService) {
        this.rosConfig = new RosConfig(config);

    }

    async init(): Promise<Function> {
        let that = this;
        if (that.rosConfig.cmake_prefix_path) {
            process.env.CMAKE_PREFIX_PATH = that.rosConfig.cmake_prefix_path;
        }

        let options = {
            anonymous: that.rosConfig.anonymous,
            rosMasterUri: that.rosConfig.rosMasterUri,
            timeout: that.rosConfig.timeout
        }

        let rosnode = require('rosnodejs');
        rosnode.initNode(that.rosConfig.nodeName, options).then((rosNode: any) => {
            that.logService.log(LogLevel.info, `Connector '${that.name}': ${chalk.green('connected')}`);
            that.rosConfig.subscriptions.forEach(sub => that.subscribe(rosNode, sub));
        })

        return async () => {
        }
    }

    async valuesCreated(values: { [name: string]: ValueGroup; }): Promise<void> {

    }

    async valuesBound(values: { [name: string]: ValueGroup; }): Promise<void> {
    }

    subscribe(rosNode: any, sub: RosSubscription) {
        //rosNode.subscribe('/xarm/joint_states', 'sensor_msgs/JointState', (msg: any) => {
        rosNode.subscribe(sub.topic, sub.type, (msg: any) => {
            sub.callbacks.forEach(cb => cb(msg));
            //sub.value = msg;
            console.log(msg);
        })
    }

    async addValue(config: any, val: ValueGroup): Promise<any> {

        const excludeConfigs = new ConnectorConfig();
        for (const subValue in config) {
            if (subValue in excludeConfigs) {
                continue;
            }

            let filtered = this.rosConfig.subscriptions.filter(s => config[subValue].startsWith(s.topic));
            if (filtered.length !== 1) {
                throw new Error(`Either none or more than one ROS topic found for subscription '${config[subValue]}'`);
            }
            let sub = filtered[0];

            let varPath: (string | number)[] = [];
            let objPath = config[subValue].substring(sub.topic.length + 1);
            let result = objPath.match(/(\[\d+\]|[^\.\[\]]+)/gm);
            if (result) {
                for (let i = 0; i < result.length; i++) {
                    let isBracket = result[i].match(/\[(\d+)\]/);
                    if (isBracket) {
                        varPath.push(Number(isBracket[1]));
                    } else {
                        varPath.push(result[i]);
                    }
                }

                this.addCallback(sub, varPath, val.values[subValue]);
            }
        }
    }

    addCallback(sub: RosSubscription, varPath: (string | number)[], value: Value) {
        sub.callbacks.push((msg: any) => {
            let target = msg;
            for (let key of varPath) {
                if (key in target) {
                    target = target[key];
                } else {
                    //TODO add error
                    return;
                }
            }
            value.setValue(target, this.name);
        })

    }

    setValue(config: ConnectorConfig, val: ValueGroup, subValue: SubValue, value: any): void {

    }

}
