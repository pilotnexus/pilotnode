import * as fse from 'fs-extra';
import { WatchValueConfig } from './watchvalueconfig';
import { ValueGroup, SubValue } from '../../value';
import { LoggingService, LogLevel } from '../../services/loggingservice';
import { FileService } from './fileservice';
import epoll from 'epoll';

export class WatchService {

  constructor(private nodeid: string, private logService: LoggingService, private terminationFunctions: any[]) {
  }

  async add(w: WatchValueConfig, valueGroup: ValueGroup): Promise<WatchValueConfig> {
    let that = this;

    let fd: number|null = null;
    try {
      if (w.epoll) {
        fd = await fse.open(w.file, 'w+');
        await that.epoll(fd, w, valueGroup, that.terminationFunctions);
      } else {
        await that.watch(w, valueGroup, that.terminationFunctions);
      }

      if (w.access[SubValue.targetValue]?.write) {
        let actualValueUpdated = false;
        let writer = await FileService.getWriter(fd, w, valueGroup.values[SubValue.targetValue], that.logService);
        valueGroup.values[SubValue.targetValue].changed( async (value: any, oldvalue: any) => {
          if (writer && typeof value !== 'undefined') {
            if (w.directwrite) {
              valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
              actualValueUpdated = true;
            }
            if (await writer(value.toString())) {
              if (!actualValueUpdated) {
                valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
              }
              return true;
            } else {
              //writing failed, set targetvalue to oldvalue so setting targetvalue
              //again will trigger a change
              //TODO: it is a bit unintuitive to have targetvalue revert to the old value
              //maybe there is a better mechanism to enabe retries to set the actualvalue
              valueGroup.values[SubValue.targetValue].setValue(oldvalue, "__local.WatchService");
              return false;
            }
          }
          return false;
         }, "__local.WatchService");
      }
    }
    catch (e) {
      that.logService.log(LogLevel.error, 'Error creating Watcher');
      that.logService.log(LogLevel.error, e);
    }

    return w;
  }

  private async readWatchFile(w: WatchValueConfig, valueGroup: ValueGroup) {
    let that = this;
    try {
      let value = await fse.readFile(w.file, 'utf8');
      valueGroup.values[SubValue.targetValue].setValue(value, "__local.WatchService");
      valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
    } catch (e) {
      that.logService.log(LogLevel.error, `error while reading watched file ${w.file}`);
      that.logService.log(LogLevel.error, e);
    }
  }

  private async watch(w: WatchValueConfig, valueGroup: ValueGroup, terminationFunctions: any[]) {
    let that = this;
    try {
      await that.readWatchFile(w, valueGroup);
      let watcher = fse.watch(w.file, async (eventType, filename) => {
        if (filename && eventType == 'change') {
          await that.readWatchFile(w, valueGroup);
        }
      });

      terminationFunctions.push(() => {
          that.logService.log(LogLevel.debug, `removing ${valueGroup.fullname} watcher`);
          watcher.close();
          that.logService.log(LogLevel.debug, `removed ${valueGroup.fullname} watcher`);
        });
    }
    catch (e) {
      that.logService.log(LogLevel.error, `error while reading watched file ${w.file}`);
      that.logService.log(LogLevel.error, e);
    }
  }

  private async epoll(valuefd: number, w: WatchValueConfig, valueGroup: ValueGroup, terminationFunctions: any[]) {
    let that = this;
      try {
        w.data = Buffer.from("          ");
        that.logService.log(LogLevel.debug, `creating poller for ${w.file}`);
        let poller = new epoll.Epoll((err: string, fd: number, events: any) => {
            that.logService.log(LogLevel.debug, `epoll event fired for ${w.file}`);
          // Read GPIO value file. Reading also clears the interrupt.
          let bytesRead = fse.readSync(fd, w.data, 0, 10, 0);
          let value = w.data.toString('ascii', 0, bytesRead);
          valueGroup.values[SubValue.targetValue].setValue(value, "__local.WatchService");
          valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
        });
        let {bytesRead, buffer} = await fse.read(valuefd, w.data, 0, 10, 0);
        poller.add(valuefd, epoll.Epoll.EPOLLIN);

        //write value
        let value = buffer.toString('ascii', 0, bytesRead);
        valueGroup.values[SubValue.targetValue].setValue(value, "__local.WatchService");
        valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");

        terminationFunctions.push(
          () => {
            poller.remove(valuefd);
            that.logService.log(LogLevel.debug, `removed ${valueGroup.fullname} epoll`);
          });
      }
      catch (e) {
        that.logService.log(LogLevel.error, `error while reading watched file ${w.file}`);
        that.logService.log(LogLevel.error, e);
      }
  }
}
