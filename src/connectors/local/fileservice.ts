import * as fse from "fs-extra";

import { Helper } from "../../helper";
import { FileValueConfig, IFileValueConfig } from "./filevalueconfig";
import { ValueGroup, SubValue } from "../../value";
import { LoggingService, LogLevel } from "../../services/loggingservice";

export class FileService {

  constructor(private nodeid: string, private log: LoggingService, private terminationFunctions: any) {
  }

  public async add(
    file: FileValueConfig,
    valueGroup: ValueGroup
  ): Promise<FileValueConfig> {
    let that = this;
    let successful = true;
    if (!(await fse.pathExists(file.file))) {
      try {
        await fse.close(await fse.open(file.file, "w"));
      } catch {
        that.log.log(LogLevel.error, `File ${file.file} did not exist and could not be created`);
        successful = false;
      }
    }
    if (successful) {
      await that.readFile(file, valueGroup);
      if (file.interval > 0) {
        that.reader(file, valueGroup, that.terminationFunctions);
      }

      if (file.access[SubValue.targetValue]?.write) {
        let writer = await FileService.getWriter(file);
        valueGroup.values[SubValue.targetValue].changed(async (value) => {
          if (writer && typeof value !== 'undefined') {
            let valuedata = (typeof value === "boolean") ? (value === true ? "1" : "0") : value.toString();
            if (await writer(valuedata))
            {
              valueGroup.values[SubValue.actualValue].setValue(value, "__local.FileService");
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
      var data = await fse.readFile(file.file, "utf8");

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
    });
  }

  public static getWriter(file: IFileValueConfig): ((value: string) => Promise<boolean>) | null  {
    let writefile = file.file;
    if (file.writefile != null && file.writefile !== "") {
      //juggling check for undefined and null
      writefile = file.writefile;

      return async (value) => {
        try {
          //console.log('writing value ' + value)
          await fse.writeFile(writefile, value, { encoding: "utf8" });
        }
        catch (e) {
          console.log(e);
          return false;
        }
        return true;
      }
    }

    return null;

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
