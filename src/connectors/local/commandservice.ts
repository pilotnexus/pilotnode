import * as cron from "node-cron";
import { CommandValueConfig } from "./commandvalueconfig";
import { ValueGroup, Value, SubValue } from "../../value";

var exec = require("child_process").exec;

export class CommandService {
  constructor(private nodeid: string, private terminationFunctions: any[]) {
    this.terminationFunctions = terminationFunctions;
  }

  public async add(
    cmd: CommandValueConfig,
    valueGroup: ValueGroup
  ): Promise<CommandValueConfig> {
    let that = this;
    if (cmd.runonstartup) {
      that.run(cmd, valueGroup);
    }

    if (cmd.interval > 0) {
      let interval = setInterval(function() {
        that.run(cmd, valueGroup);
      }, cmd.interval);

      that.terminationFunctions.push(() => {
        clearInterval(interval);
      });
    } else if (cron.validate(cmd.cron)) {
      var task = cron.schedule(cmd.cron, function() {
        that.run(cmd, valueGroup);
      });

      that.terminationFunctions.push(() => {
        task.stop();
      });
    } else {
      console.log(
        `could not add command subscription ${valueGroup.fullname}. Neither interval nor cron properties are valid`
      );
    }
    return cmd;
  }

  private run(cmd: CommandValueConfig, valueGroup: ValueGroup) {
    try {
      exec(cmd.command, function(
        error: string,
        stdout: string,
        stderr: string
      ) {
        // command output is in stdout
        if (cmd.filter) {
          let result = cmd.filter(stdout, valueGroup);
          if (typeof result === "string" && result !== cmd.data) {
            cmd.data = stdout;
            valueGroup.values[SubValue.actualValue].setValue(result, "__local.CommandService");
          }
        } else if (stdout != cmd.data) {
          cmd.data = stdout;
          valueGroup.values[SubValue.actualValue].setValue(stdout, "__local.CommandService");
        }
      });
    } catch (e) {
      console.log(e);
    }
  }
}
