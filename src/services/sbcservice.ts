import { injectable, inject } from "inversify";
import * as os from "os";
import * as fse from "fs-extra";
import { CommandService } from "../connectors/local/commandservice";
import { FileService } from "../connectors/local/fileservice";
import { ValueService } from "./valueservice";
import { ValueType, ValueGroup, SubValue, ConnectorConfig, ValueProperties, DataType } from "../value";
import { FileValueConfig } from "../connectors/local/filevalueconfig";
import { CommandValueConfig } from "../connectors/local/commandvalueconfig";
import { LocalConfig } from "../connectors/local/localconfig";

export interface ISbcResult {
  c: LocalConfig;
  v: ValueGroup;
}

export class MeasureCoreTempConfig {
  interval: number = 15000

  public constructor(init?: Partial<MeasureCoreTempConfig>) {
    Object.assign(this, init);
  }
}

@injectable()
export class SbcService {
  static keys = { measureCoreTemp: '_stats/temp' };

  public constructor(
    private nodeId: string,
    private commandService: CommandService,
    private fileService: FileService,
    private valueService: ValueService
  ) {
  }

  async is_raspberry(): Promise<boolean> {
    try {
      let regex = /Hardware\s*:\s*(.+?)$/gm;
      let hardware = ["BCM2835", "BCM2836"];
      let cpuinfo = await fse.readFile("/proc/cpuinfo", "utf8");
      let match = regex.exec(cpuinfo);
      if (match && hardware.indexOf(match[1]) >= 0) {
        return true;
      }
    } catch (e) {
      console.log(e);
    }
    return false;
  }

  measureCoreTemp(valueGroup?: ValueGroup): ISbcResult {
    const key = "_stats/temp";
    const cfg = new MeasureCoreTempConfig(valueGroup?.config);
    const valueProp = new ValueProperties({
      datatype: DataType.double,
      valuetype: ValueType.temperature
    });

    // set correct value properties
    if (valueGroup) {
      valueGroup.setValueProperties(valueProp);
    } else {
      valueGroup = new ValueGroup(this.nodeId, key, {}, {}, valueProp);
    }

    let c = new FileValueConfig({
      interval: cfg.interval,
      file: "/sys/class/thermal/thermal_zone0/temp",
      filter: (value: string, v: ValueGroup) => {
        let temp = Number(value);
        if (isNaN(temp)) {
          v.values[SubValue.actualValue].setValue(0, "__local.sbcservice");
        } else {
          v.values[SubValue.actualValue].setValue(temp / 1000, "__local.sbcservice" );
        }
      }
    });

    // await this.fileService.add(await this.valueService.addSubscription<FileValueConfig>(filesub));
    return { c, v: valueGroup };
  }

  diskUsage(interval = 600000): ISbcResult {
    const key = "_stats/df";

    let v = new ValueGroup(this.nodeId, key, {}, {}, new ValueProperties({datatype: DataType.object}));
    let regex = /^(.+?)\s+(\d+?)\s+(\d+?)\s+(\d+?)\s+(\d+?)%\s+(.+)$/gm;
    let m;

    let c = new CommandValueConfig({
      interval,
      command: "df",
      filter: (value: string, v: ValueGroup) => {
        let result = [];
        do {
          m = regex.exec(value);
          if (m) {
            result.push({
              fs: m[1],
              blocks: Number(m[2]),
              used: Number(m[3]),
              available: Number(m[4]),
              use: Number(m[5]),
              mounted: m[6]
            });
          }
        } while (m);
        v.values[SubValue.actualValue].setValue(result, "__local.sbcservice");
      }
    });

    //return await this.commandService.add(await this.valueService.addSubscription<CommandValueConfig>(await this.commandService.add(commandsub)));
    return { v, c };
  }

  upgradablePackages(cron = "0 4 * * *"): ISbcResult {
    // default runs daily at 4 am
    let key = "_stats/packages";
    let v = new ValueGroup(this.nodeId, key, {}, {}, new ValueProperties( {datatype: DataType.object}));
    let c = new CommandValueConfig({
      cron,
      command: `sudo LC_ALL=C sh -c 'apt-get update > /dev/null 2>&1; apt-get -u upgrade --assume-no'`,
      filter: (value: string, v: ValueGroup) => {
        // let exec2 = `sudo sh -c 'grep precise-security /etc/apt/sources.list > /etc/apt/secsrc.list; apt-get -o Dir::Etc::sourcelist="secsrc.list" -o Dir::Etc::sourceparts="-" update && apt-get --assume-no upgrade'`
        let ret = {};
        let matches = /(?:The following packages will be upgraded:([\s\S]*))?^(\d+)\s+upgraded.*?(\d+)\s+newly installed.*?(\d+)\s+to remove.*?(\d+)\s*not upgraded(?:[\s\S]*?Need to get ([\d\.]+) ([a-zA-Z]+) of archives[\s\S]*?After this operation, (\d+) ([a-zA-Z]+) of additional disk space will be used)?/gm.exec(
          value
        );
        if (matches) {
          ret = {
            packages: (matches[1] && matches[1].match(/\S+/g)) || [],
            upgraded: Number(matches[2]),
            newly_installed: Number(matches[3]),
            to_remove: Number(matches[4]),
            not_upgraded: Number(matches[5]),
            download_size: Number(matches[6]) || 0,
            download_size_unit: matches[7] || "",
            additional_space: Number(matches[8]) || 0,
            additional_space_unit: matches[9] || ""
          };

          v.values[SubValue.actualValue].setValue(ret, "__local.sbcservice");
        }
  }
    });

    //return await this.commandService.add(await this.valueService.addSubscription<CommandValueConfig>(commandsub));
    return { v, c };
  }

  public static staticOsInfoObject() {
    return {
      arch: os.arch(),
      cpus: os.cpus(),
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      totalmem: os.totalmem(),
      memwarn: 0.8,
      diskwarn: 0.7,
      cputempwarn: 75,
      memmax: 0.9,
      diskmax: 0.85,
      cputempmax: 85
    };
  }

  //async osInfoPeriodical(interval = 30000) { //1 min interval
  //  let pluginsub = new PluginValueConfig({ pluginName: 'osInfoPeriodical'});

  //  let getInfo = () => {
  //    return {
  //      freemem: os.freemem(),
  //      loadavg: os.loadavg()[0],
  //      uptime: os.uptime()
  //    }
  //  }

  //  this.valueService.addSubscription(await this.pluginService.add(pluginsub));

  //await pluginsub.actualValue.setValue(getInfo(), "__local.sbcservice");
  //setInterval( async() => {
  //  await pluginsub.actualValue.setValue(getInfo(),"__local.sbcservice" );
  //}, interval);

  //return pluginsub;
  //}
}
