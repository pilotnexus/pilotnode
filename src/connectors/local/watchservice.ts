import fs from "fs-extra";
import path from 'path';
import epoll from 'epoll';
import { WatchValueConfig } from './watchvalueconfig.js';
import { ValueGroup, SubValue } from '../../value.js';
import { LoggingService, LogLevel } from '../../services/loggingservice.js';
import { FileService } from './fileservice.js';
import { getBasedir } from '../../folders.js';
import { setTimeout } from "timers/promises";

export class WatchService {

    constructor(private nodeid: string, private logService: LoggingService, private terminationFunctions: any[]) {
    }

    async add(w: WatchValueConfig, valueGroup: ValueGroup): Promise<WatchValueConfig> {
        let that = this;

        let fd: number | null = null;
        try {
            if (w.epoll) {
                await that.check_plc_subscribe(w.file);
                fd = await fs.open(w.file, 'w+');
                await that.epoll(fd, w, valueGroup, that.terminationFunctions);
            } else {
                await that.watch(w, valueGroup, that.terminationFunctions);
            }

            if (w.access[SubValue.targetValue]?.write) {
                let actualValueUpdated = false;
                let writer = await FileService.getWriter(fd, w, valueGroup.values[SubValue.targetValue], that.logService);
                valueGroup.values[SubValue.targetValue].changed(async (value: any, oldvalue: any) => {
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

    private async check_plc_subscribe(file: string) {
        let that = this;
        try {
            if (file.startsWith(path.join(getBasedir(), 'plc/variables')) && file.endsWith('value')) {
                that.logService.log(LogLevel.debug, `plc variable file ${file} detected, check if subscribed`);
                let subscriptionFile = file.substring(0, file.length - 5) + 'subscribe';
                if (await fs.exists(subscriptionFile)) {
                    if ((await fs.readFile(subscriptionFile, 'utf8')).trim() === '0') {
                        that.logService.log(LogLevel.debug, `plc variable ${subscriptionFile}, subscribing`);
                        await fs.writeFile(subscriptionFile, "1", { encoding: "utf8" });
                        that.logService.log(LogLevel.debug, `plc variable ${subscriptionFile}, subscribed`);
                    }
                    that.logService.log(LogLevel.debug, `plc variable subsription file ${subscriptionFile} found`);
                } else {
                    that.logService.log(LogLevel.error, `plc variable subsription file ${subscriptionFile} not found, doing nothing`);
                }
            }
        }
        catch (e) {
            that.logService.log(LogLevel.error, `error while checking PLC subscription file for variable ${file}`);
            that.logService.log(LogLevel.error, e);
        }

    }

    private async readWatchFile(w: WatchValueConfig, valueGroup: ValueGroup) {
        let that = this;
        for (let i = 0; i < w.readretry; i++) {
            try {
                let value = await fs.readFile(w.file, 'utf8');
                valueGroup.values[SubValue.targetValue].setValue(value, "__local.WatchService");
                valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
                return;
            }
            catch (e) {
                if (i === w.readretry - 1) {
                    that.logService.log(LogLevel.error, `error while reading watched file ${w.file}`);
                    that.logService.log(LogLevel.error, e);
                } else {

                }
            }
        }
    }

    private async watch(w: WatchValueConfig, valueGroup: ValueGroup, terminationFunctions: any[]) {
        let that = this;
        try {
            await that.readWatchFile(w, valueGroup);
            let watcher = fs.watch(w.file, async (eventType, filename) => {
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
                let bytesRead = fs.readSync(fd, w.data, 0, 10, 0);
                let value = w.data.toString('ascii', 0, bytesRead);
                valueGroup.values[SubValue.targetValue].setValue(value, "__local.WatchService");
                valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
            });
            let { bytesRead, buffer } = await fs.read(valuefd, w.data, 0, 10, 0);
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
