import { Helper } from '../../helper.js';
import { ConnectorConfig, ValueGroup, SubValue } from '../../value.js';
import { EmulationValueConfig, EmulationType } from './emulationvalueconfig.js';


export class EmulationService {

    public clearIntervalCallbacks: Array<Function> = [];

    constructor() {
    }

    add(sub: EmulationValueConfig, valueGroup: ValueGroup): EmulationValueConfig {
        switch (EmulationType[sub.emutype]) {
            case EmulationType.sine:
                this.createSineEmulator(sub, valueGroup);
                break;
            case EmulationType.bit:
                this.createBitEmulator(sub, valueGroup);
                break;
            default:
                break;
        }
        return sub;
    }

    createSineEmulator(sub: EmulationValueConfig, valueGroup: ValueGroup) {
        let n = 0;
        let that = this;
        let interval = setInterval(function() {
            try {
                let value = sub.offset + (sub.scale * Math.sin((Math.PI * 2) * n));
                valueGroup.values[SubValue.actualValue].setValue(value, "__local.EmulationService");
                n += sub.interval / sub.period;
            }
            catch (e) {
                console.log(e);
            }
        }, sub.interval);

        that.clearIntervalCallbacks.push(() => {
            clearInterval(interval);
        });
    }

    createBitEmulator(sub: EmulationValueConfig, valueGroup: ValueGroup) {
        let n: boolean;
        let that = this;
        let interval = setInterval(function() {
            try {
                n = !n;
                valueGroup.values[SubValue.actualValue].setValue(n, "__local.EmulationService");
            }
            catch (e) {
                console.log(e);
            }
        }, sub.interval);

        that.clearIntervalCallbacks.push(() => {
            clearInterval(interval);
        });

    }

}
