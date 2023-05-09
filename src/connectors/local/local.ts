import { injectable, inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import {
    ConnectorConfig,
    IConnectorBaseConfig,
    Value,
    ValueGroup,
    SubValue
} from "../../value.js";
import { ValueService } from "../../services/valueservice.js";
import { ConfigService } from "../../services/configservice.js";
import { WatchService } from "./watchservice.js";
import { CommandService } from "./commandservice.js";
import { SerialService } from "./serialservice.js";
import { EmulationService } from "./emulationservice.js";
import { FileService } from "./fileservice.js";
import { SbcService, ISbcResult, MeasureCoreTempConfig } from "../../services/sbcservice.js";
import { FileValueConfig } from "./filevalueconfig.js";
import { WatchValueConfig } from "./watchvalueconfig.js";
import { CommandValueConfig } from "./commandvalueconfig.js";
import { EmulationValueConfig } from "./emulationvalueconfig.js";
import { SerialValueConfig } from "./serialvalueconfig.js";
import { LocalConfig } from "./localconfig.js";
import { LoggingService, LogLevel } from "../../services/loggingservice.js";
import { IConnectorFactory, IConnector } from "../connector.js";
import { NAMED_OBJECTS } from "../../inversify.config.js";
import { PilotService } from "./pilotservice.js";

@injectable()
export class LocalConnectorFactory implements IConnectorFactory {
    CONNECTOR_CLASS: string = "local";
    type = this.CONNECTOR_CLASS;

    constructor(
        private config: ConfigService,
        private valueService: ValueService,
        private log: LoggingService
    ) { }

    create(name: string, connectorConfig: any): IConnector {
        return new LocalConnector(this.config, new LocalConfig(connectorConfig), this.valueService, this.log);
    }
}

@injectable()
export class LocalConnector implements IConnector {

    terminationFunctions: Array<Function> = [];
    fileService: FileService;
    watchService: WatchService;
    commandService: CommandService;
    serialService: SerialService;
    emulationService: EmulationService;
    sbcService: SbcService;

    pilotService: PilotService;
    subs: LocalConfig[];
    connected: boolean = false;

    sbcValues: ISbcResult[] = [];

    public constructor(
        private config: ConfigService,
        private localConfig: LocalConfig,
        private valueService: ValueService,
        private log: LoggingService
    ) {
        this.fileService = new FileService(
            config.config.nodeid,
            this.log,
            this.terminationFunctions
        );
        this.watchService = new WatchService(
            config.config.nodeid,
            this.log,
            this.terminationFunctions
        );
        this.commandService = new CommandService(
            config.config.nodeid,
            this.log,
            this.terminationFunctions
        );
        this.serialService = new SerialService(config.config.nodeid);
        this.emulationService = new EmulationService();
        this.sbcService = new SbcService(
            config.config.nodeid,
            this.commandService,
            this.fileService,
            this.valueService
        );

        this.pilotService = new PilotService(config.config.nodeid, localConfig.pilotservice, this.log);

        this.subs = [];
    }

    async init() {
        let that = this;

        //pilot services
        await that.pilotService.create();

        //let digitalioservice = new DigitalIOService();
        //digitalioservice.update();
        return async () => {
            that.log.log(LogLevel.debug, `closing ${that.terminationFunctions.length} local connector values...`);
            for (let terminate of that.terminationFunctions) {
                await terminate();
            }
        }
    }

    async valuesCreated(values: { [name: string]: ValueGroup }): Promise<void> {
        let that = this;
        try {
            that.sbcValues.push(await that.sbcService.diskUsage());
            that.sbcValues.push(await that.sbcService.measureCoreTemp(values[SbcService.keys.measureCoreTemp]));
            //that.sbcValues.push(await that.sbcService.osInfoPeriodical());
            that.sbcValues.push(await that.sbcService.upgradablePackages());

            that.sbcValues.forEach(v => that.addValue(v.c, v.v));
        } catch (e) {
            console.log("Failed creating sbc subscriptions");
            console.log(e);
        }
        that.sbcValues.forEach(v => (values[v.v.fullname] = v.v));
    }

    async valuesBound(values: { [name: string]: ValueGroup }): Promise<void> { }

    async addValue(config: any, valueGroup: ValueGroup): Promise<any> {
        let that = this;
        let sub = new LocalConfig(config);

        try {
            switch (sub.class) {
                case "file":
                    that.fileService.add(new FileValueConfig(sub), valueGroup);
                    break;
                case "watch":
                    that.watchService.add(new WatchValueConfig(sub), valueGroup);
                    break;
                case "command":
                    that.commandService.add(new CommandValueConfig(sub), valueGroup);
                    break;
                case "emulation":
                    that.emulationService.add(new EmulationValueConfig(sub), valueGroup);
                    break;
                case "serial":
                    //await that.serialService.add(new SerialValueConfig(sub));
                    break;
                default:
                    this.log.log(
                        LogLevel.error,
                        `Cannot find local class '${sub.class}'`
                    );
            }
        } catch (e) {
            console.log("Failed creating subscription");
            console.log(e);
        }

    }

    setValue(
        config: ConnectorConfig,
        val: ValueGroup,
        subValue: SubValue,
        value: any
    ) { }
}
