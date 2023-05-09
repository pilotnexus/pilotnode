import fs from "fs-extra";

import { Helper } from "../../helper.js";
import { FileValueConfig, IFileValueConfig } from "./filevalueconfig.js";
import { ValueGroup, SubValue, Value } from "../../value.js";
import { LoggingService, LogLevel } from "../../services/loggingservice.js";

export class FileService {

    constructor(private nodeid: string, private logService: LoggingService, private terminationFunctions: any) {
    }

    public async add(
        file: FileValueConfig,
        valueGroup: ValueGroup
    ): Promise<FileValueConfig> {
        let that = this;
        let successful = true;
        if (!(await fs.pathExists(file.file))) {
            try {
                fs.closeSync(await fs.open(file.file, "w"));
            } catch {
                that.logService.log(LogLevel.error, `File ${file.file} did not exist and could not be created`);
                successful = false;
            }
        }
        if (successful) {
            await that.readFile(file, valueGroup);
            if (file.interval > 0) {
                that.reader(file, valueGroup, that.terminationFunctions);
            }

            if (file.access[SubValue.targetValue]?.write) {
                let actualValueUpdated = false;
                let writer = await FileService.getWriter(null, file, valueGroup.values[SubValue.targetValue], that.logService);
                valueGroup.values[SubValue.targetValue].changed(async (value, oldvalue) => {
                    if (writer && typeof value !== 'undefined') {
                        let valuedata = (typeof value === "boolean") ? (value === true ? "1" : "0") : value.toString();
                        if (file.directwrite) {
                            valueGroup.values[SubValue.actualValue].setValue(value, "__local.FileService");
                            actualValueUpdated = true;
                        }
                        if (await writer(valuedata)) {
                            if (!actualValueUpdated) {
                                valueGroup.values[SubValue.actualValue].setValue(value, "__local.FileService");
                            }
                            return true;
                        } else {
                            //writing failed, set targetvalue to oldvalue so setting targetvalue
                            //again will trigger a change
                            //TODO: it is a bit unintuitive to have targetvalue revert to the old value
                            //maybe there is a better mechanism to enabe retries to set the actualvalue
                            valueGroup.values[SubValue.targetValue].setValue(oldvalue, "__local.FileService");
                            return false;
                        }
                    }
                    return false;
                }, "__local.FileService");

            }
        }

        return file;
    }

    private async readFile(file: FileValueConfig, valueGroup: ValueGroup) {
        let that = this;
        try {
            var data = await fs.readFile(file.file, "utf8");

            if (file.filter) {
                let result = file.filter(data, valueGroup);
                if (typeof result === "string" && result !== file.data) {
                    file.data = data;
                    valueGroup.values[SubValue.actualValue].setValue(result, "__local.FileService");
                }
            } else if (data != file.data) {
                file.data = data;
                valueGroup.values[SubValue.actualValue].setValue(data, "__local.FileService");
            }
        } catch (e) {
            console.log(e);
        }
    }

    private async reader(
        file: FileValueConfig,
        valueGroup: ValueGroup,
        terminationFunctions: any[]
    ) {
        let that = this;
        let interval = setInterval(async () => {
            await that.readFile(file, valueGroup);
        }, file.interval);

        terminationFunctions.push(() => {
            clearInterval(interval);
            that.logService.log(LogLevel.debug, `removed ${valueGroup.fullname} polling interval`);
        });
    }

    /// if fd is null, the file is opened and written to,
    /// otherwise it is assumed that fd points to an open file
    /// with write permissions
    public static getWriter(fd: number | null, file: IFileValueConfig, v: Value, log: LoggingService): ((value: string) => Promise<boolean>) | null {
        let writefile: string;
        let use_fd = (typeof fd !== 'undefined' && fd != null);

        //if writefile is defined
        if (file.writefile && file.writefile !== "") {
            if (file.writefile != file.file) { //writefile differs from file
                use_fd = false; //if the filenames are different, don't use the fd
                // since it points fo file.file.
                log.log(LogLevel.debug, `writefile is ${file.writefile} and file set to ${file.file}. We are not using the file descriptor for writing. File is opened and closed every time data is written.`);
            }
            writefile = file.writefile;
        } else { //otherwise always use filename
            writefile = file.file;
        }

        const boolcheck = (value: any): any => {
            if (v.properties.isBoolean()) {
                if (value === 'true' || value === 'on' || value === '1' || value === 'enable') {
                    return '1';
                } else {
                    return '0';
                }
            } else {
                return value;
            }
        }

        if (use_fd && fd) {
            return async (value) => {
                try {
                    value = boolcheck(value);
                    await fs.write(fd, value);
                }
                catch (e) {
                    console.log(e);
                    return false;
                }
                return true;
            }
        } else {
            return async (value) => {
                try {
                    value = boolcheck(value);
                    await fs.writeFile(writefile, value, { encoding: "utf8" });
                }
                catch (e) {
                    console.log(e);
                    return false;
                }
                return true;
            }
        }

        /*
        let counter = 0;
        file.callbacks.push({'vs': async (value) => {
          if (value == '1') {
            counter = 0;
          }
          try {
            await fse.writeFile(writefile, value, { encoding: "utf8" });
            file.changed(value);
          }
          catch (e) {
            console.log(e);
            return false;
          }
          return true;
        }});
        */

        if (file.monitorTimeout != null && file.monitorTimeout > 0) {
            // TODO - implement cnt with RPCs
            /*
            file.callbacks.push({'cnt': async (value) => {
              try {
                if (Number(value) > counter) {
                  counter = Number(value);
                  console.log(`counter inc ${counter}`)
                  await fse.writeFile(writefile, '1', { encoding: "utf8" });
                  file.changed('1');
                }
                else {
                  await fse.writeFile(writeFile, '0', { encoding: "utf8" });
                  file.changed('0');
                }
              }
              catch (e) {
                console.log(e);
                return false;
              }
              return true;
            }});
            */
        }
    }
}
