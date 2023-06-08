import fs from "fs-extra";
import { Helper } from '../helper.js';
import { ConnectorConfig } from '../value.js';

export interface IGpioChip {
    module: number
    fid: string
    gpiochip: number
    pincount: number
}

export class DigitalIOService {
    gpioRootDir = '/sys/class/gpio'
    digitaliofids: string[] = ['i8', 'o8', 'io16', 'r4'];
    gpiochipinfos: IGpioChip[] = [];

    constructor() {
        this.update();
    }

    public async update() {
        this.gpiochipinfos = [];
        let chipre = /gpiochip(\d+)/gm;
        let gpiore = /pilot(.*?)_(\d+)/gm;

        let files = await fs.readdir(this.gpioRootDir)
        let dirs = []
        let gpiochippath = `${this.gpioRootDir}/gpiochip`;

        for (let file in files) {
            let chip = chipre.exec(file);
            if (chip) {
                let label = await fs.readFile(`${this.gpioRootDir}/${file}/label`, 'utf8');
                let ngpio = await fs.readFile(`${this.gpioRootDir}/${file}/ngpio`, 'utf8');
                let m = gpiore.exec(label);
                if (m) {
                    this.gpiochipinfos.push({
                        module: Number(m[2]),
                        fid: m[1],
                        gpiochip: Number(chip[1]),
                        pincount: Number(ngpio)
                    });
                }
            }
        }
    }

    public export() {

    }
}
