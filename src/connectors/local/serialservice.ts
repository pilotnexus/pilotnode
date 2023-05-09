import { SerialValueConfig } from './serialvalueconfig';
import { ValueGroup, SubValue } from '../../value.js';
import { LoggingService, LogLevel } from '../../services/loggingservice.js';

import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';

export class SerialService {

    ports: { [name: string]: any };

    constructor(private nodeid: string, private logService: LoggingService, private terminationFunctions: any[]) {
        this.ports = {};
    }

    public async add(sub: SerialValueConfig, valueGroup: ValueGroup): Promise<SerialValueConfig> {
        let that = this;
        let baudrate = Number(sub.baudrate);
        if (Number.isNaN(baudrate) || baudrate === 0) {
            baudrate = 9600;
        }

        try {
            that.ports[valueGroup.fullname] = new SerialPort({
                path: sub.port,
                baudRate: baudrate
            });
            that.ports[valueGroup.fullname].on('readable', function() {
                valueGroup.values[SubValue.actualValue].setValue(that.ports[valueGroup.fullname].read(), "__local.SerialService");
            });

            const parser = that.ports[valueGroup.fullname].pipe(new DelimiterParser({ delimiter: sub.delimiter }));
            parser.on('data', (value) => {
                valueGroup.values[SubValue.actualValue].setValue(value, "__local.WatchService");
            });

            //write to serial port
            if (sub.access[SubValue.targetValue]?.write) {
                valueGroup.values[SubValue.targetValue].changed(async (value, oldvalue) => {
                    that.ports[valueGroup.fullname].write(value + sub.delimiter);
                    return true;
                }, "__local.SerialService");
            }

        }
        catch (e) {
            //console.error(`Could not create serialport subscription ${sub.name}`);
            console.error(e);
        }
        return sub;
    }
}
