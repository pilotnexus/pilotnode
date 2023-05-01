import { SerialValueConfig } from './serialvalueconfig';
import { ValueGroup, SubValue } from '../../value';

var SerialPort = require('serialport');

export class SerialService {
  
  nodeid: string;
  ports: { [name: string]: any };

  constructor(nodeid: string) {
   this.nodeid = nodeid;
   this.ports = {};
  }

  public async add(sub: SerialValueConfig, valueGroup: ValueGroup) : Promise<SerialValueConfig> {
    let that = this;
    let baudrate = Number(sub.baudrate);
    if (Number.isNaN(baudrate) || baudrate === 0) {
      baudrate = 9600;
    }

    try {
      that.ports[valueGroup.fullname] = new SerialPort(sub.port, {
        baudRate: baudrate
      });
      that.ports[valueGroup.fullname].on('readable', function () {
        valueGroup.values[SubValue.actualValue].setValue(that.ports[valueGroup.fullname].read(), "__local.SerialService");
      });
      /*
      sub.callbacks.push({'vr': (value) => {
        that.ports[sub.name].write(value)
        }
      });
     */
    }
    catch(e) {
      //console.error(`Could not create serialport subscription ${sub.name}`);
      console.error(e);
    }
    return sub;
  }
}
