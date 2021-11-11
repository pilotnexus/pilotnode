import * as fse from 'fs-extra';
import { WatchValueConfig } from './watchvalueconfig';
import { ValueGroup, SubValue } from '../../value';
import { LoggingService, LogLevel } from '../../services/loggingservice';
import { FileService } from './fileservice';

export class WatchService {

  constructor(private nodeid: string, private log: LoggingService, private terminationFunctions: any[]) {
  }

  async add(w: WatchValueConfig, valueGroup: ValueGroup): Promise<WatchValueConfig> {
    let that = this;
    try {
      if (w.epoll) {
        await that.epoll(w, valueGroup, that.terminationFunctions);
      } else {
        await that.watch(w, valueGroup);
      }

      if (w.access[SubValue.targetValue]?.write) {
        let writer = FileService.getWriter(w);
        valueGroup.values[SubValue.targetValue].changed( async (value) => {
          if (writer && typeof value !== 'undefined') {
            return await writer(value.toString());
          }
          return false;
         }, "__local.WatchService");
      }
    }
    catch (e) {
      console.log('Error creating Watcher');
      console.log(e)
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
      console.log('error while reading watched file')
      console.log(e)
    }
  }

  private async watch(w: WatchValueConfig, valueGroup: ValueGroup) {
    let that = this;
    try {
      await that.readWatchFile(w, valueGroup);
      fse.watch(w.file, async (eventType, filename) => {
        if (filename && eventType == 'change') {
          await that.readWatchFile(w, valueGroup);
        }
      });
    }
    catch (e) {
      console.log('error while reading watched file')
      console.log(e)
    }
  }

  private async epoll(w: WatchValueConfig, valueGroup: ValueGroup, terminationFunctions: any[]) {
    let that = this;
    let epoll = await import('epoll')
      try {
        let valuefd = await fse.open(w.file, 'w+');
        w.data = Buffer.from("          ");
        let poller = new epoll.Epoll(async (err: string, fd: number, events: any) => {
            that.log.log(LogLevel.debug, `epoll event fired for ${w.file}`);
          // Read GPIO value file. Reading also clears the interrupt.
          let readResult = await fse.read(fd, w.data, 0, 10, 0);
          let value = readResult.buffer.toString('ascii', 0, readResult.bytesRead);
          valueGroup.values[SubValue.targetValue].setValue(value, "__local.WatchService");
          valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
          //console.log(buffer.toString('ascii', 0, bytesread));
        });
        //await fse.write(valuefd, "S");
        await fse.read(valuefd, w.data, 0, 10, 0);
        poller.add(valuefd, epoll.Epoll.EPOLLIN);

        terminationFunctions.push(
          () => {
            poller.remove(valuefd);
          });
      }
      catch (e) {
        console.log('error while reading watched file')
        console.log(e)
      }
  }
}
