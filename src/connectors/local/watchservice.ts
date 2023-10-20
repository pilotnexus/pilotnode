import fs from "fs-extra";
import path from 'path';
import epoll from 'epoll';
import { WatchValueConfig } from './watchvalueconfig.js';
import { ValueGroup, SubValue } from '../../value.js';
import { LoggingService } from '../../services/loggingservice.js';
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
                fd = await that.epoll(w, valueGroup, that.terminationFunctions);
            } else {
                fd = await that.watch(w, valueGroup, that.terminationFunctions);
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
            that.logService.logger.error('Error creating Watcher');
            that.logService.logger.error(e);
        }

        return w;
    }

    private async check_plc_subscribe(file: string) {
        let that = this;
        try {
            if (file.startsWith(path.join(getBasedir(), 'plc/variables')) && file.endsWith('value')) {
                that.logService.logger.debug(`plc variable file ${file} detected, check if subscribed`);
                let subscriptionFile = file.substring(0, file.length - 5) + 'subscribe';
                if (await fs.exists(subscriptionFile)) {
                    if ((await fs.readFile(subscriptionFile, 'utf8')).trim() === '0') {
                        that.logService.logger.debug(`plc variable ${subscriptionFile}, subscribing`);
                        await fs.writeFile(subscriptionFile, "1", { encoding: "utf8" });
                        that.logService.logger.debug(`plc variable ${subscriptionFile}, subscribed`);
                    }
                    that.logService.logger.debug(`plc variable subsription file ${subscriptionFile} found`);
                } else {
                    that.logService.logger.error(`plc variable subsription file ${subscriptionFile} not found, doing nothing`);
                }
            }
        }
        catch (e) {
            that.logService.logger.error(`error while checking PLC subscription file for variable ${file}`);
            that.logService.logger.error(e);
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
                    that.logService.logger.error(`error while reading watched file ${w.file}`);
                    that.logService.logger.error(e);
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
                that.logService.logger.debug(`removing ${valueGroup.fullname} watcher`);
                watcher.close();
                that.logService.logger.debug(`removed ${valueGroup.fullname} watcher`);
            });

            return await fs.open(w.file, 'w+');
        }
        catch (e) {
            that.logService.logger.error(`error while reading watched file ${w.file}`);
            that.logService.logger.error(e);
        }
        return null;
    }

    private async epoll(w: WatchValueConfig, valueGroup: ValueGroup, terminationFunctions: any[]) {
        let that = this;
        let fd: number | null = null;
        let poller: any | null = null;
        for (let i = 0; i < w.readretry; i++) {
            try {
                fd = await fs.open(w.file, 'w+');
                w.data = Buffer.from("          ");
                that.logService.logger.debug(`creating poller for ${w.file}`);
                poller = new epoll.Epoll((_err: string, fd: number, _events: any) => {
                    that.logService.logger.debug(`epoll event fired for ${w.file}`);
                    // Read GPIO value file. Reading also clears the interrupt.
                    let bytesRead = fs.readSync(fd, w.data, 0, 10, 0);
                    let value = w.data.toString('ascii', 0, bytesRead);
                    valueGroup.values[SubValue.targetValue].setValue(value, "__local.WatchService");
                    valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
                });
                let { bytesRead, buffer } = await fs.read(fd, w.data, 0, 10, 0);
                poller.add(fd, epoll.Epoll.EPOLLIN);

                //write value
                let value = buffer.toString('ascii', 0, bytesRead);
                valueGroup.values[SubValue.targetValue].setValue(value, "__local.WatchService");
                valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");

                terminationFunctions.push(
                    () => {
                        poller.remove(fd);
                        if (fd != null) {
                            fs.closeSync(fd);
                        }
                        that.logService.logger.debug(`removed ${valueGroup.fullname} epoll`);
                    });
                break;
            }
            catch (e) {
                try {
                    poller.remove(fd);
                }
                catch { }
                try {
                    if (fd != null) {
                        fs.closeSync(fd);
                    }
                }
                catch { }

                if (i === w.readretry - 1) {
                    that.logService.logger.error(`error while reading watched epoll file ${w.file}`);
                    that.logService.logger.error(e);
                } else {
                }
            }
        }
        return fd;
    }
}
