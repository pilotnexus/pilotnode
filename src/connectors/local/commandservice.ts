import * as cron from "node-cron";
import { CommandValueConfig } from "./commandvalueconfig.js";
import { ValueGroup, Value, SubValue } from "../../value.js";
import { LoggingService } from "../../services/loggingservice.js";

import { exec } from "child_process";

export class CommandService {
    constructor(private nodeid: string, private logService: LoggingService, private terminationFunctions: any[]) {
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

        if (cmd.interval > 0 && !cron.validate(cmd.cron)) {
            let interval = setInterval(function() {
                that.run(cmd, valueGroup);
            }, cmd.interval);

            that.terminationFunctions.push(() => {
                clearInterval(interval);
                that.logService.logger.debug(`removed ${valueGroup.fullname} polling interval`);
            });
        } else if (cron.validate(cmd.cron)) {
            var task = cron.schedule(cmd.cron, function() {
                that.run(cmd, valueGroup);
            });

            that.terminationFunctions.push(() => {
                task.stop();
                that.logService.logger.debug(`removed ${valueGroup.fullname} cron job`);
            });
        } else {
            that.logService.logger.error(`could not add command subscription ${valueGroup.fullname}. Neither interval nor cron properties are valid`);
        }
        return cmd;
    }

    private run(cmd: CommandValueConfig, valueGroup: ValueGroup) {
        try {
            exec(cmd.command, function(
                error: Error | null,
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
