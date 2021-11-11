import * as wifi from 'node-wifi'

export interface INetwork {
  ssid: string,
  bssid: string,
  mac: string, // equals to bssid (for retrocompatibility)
  channel: number;
  frequency: number; // in MHz
  signal_level: number; // in dB
  security: string; // 'WPA WPA2' // format depending on locale for open networks in Windows
  security_flags: string; // encryption protocols (format currently depending of the OS)
  mode: string; // network mode like Infra (format currently depending of the OS)
  connected: boolean;
}

export class WifiService {

  /**
   *
   */
  constructor() {
    wifi.init({
      iface : 'wlan0' // null // network interface, choose a random wifi interface if set to null
    });
  }

  /* Scan the wifi network */
  public async scan(): Promise<any> {

    return new Promise<any>(resolve => {
      wifi.scan(function(error: string, networks: Array<INetwork>) {
        if (error) {
            console.log(error);
            resolve({error});
        } else {
          networks.forEach(nw => nw.connected = false);
          wifi.getCurrentConnections(function(error: string, currentConnections: Array<INetwork>) {
            if (error) {
              console.log(error);
              resolve({error});
            } else {
              console.log(currentConnections);
              if (currentConnections) {
                currentConnections.forEach(current => {
                  let matching = networks.find(n => n.ssid === current.ssid);
                  if (matching) {
                    matching.connected = true;
                  } else {
                    current.connected = true;
                    networks.push(current);
                  }
                })
              }
              resolve (networks);
            }
          });
        }
      });  
    })
  }

  /* Scan the wifi network */
  public async connect(ssid: string, password: string): Promise<any> {
    return new Promise<any>(resolve => {
      wifi.connect({ ssid, password}, function(error:string) {
        if (error) {
          console.log(error);
          resolve({success: false, error});
        } else {
          wifi.getCurrentConnections(function(error:string, currentConnections: Array<INetwork>) {
            if (error) {
              console.log(error);
              resolve({success: false, error});
            } else {
              if (currentConnections.find(n => n.ssid === ssid)) {
                console.log('Connected to ' + ssid);
                resolve({success: true, error: ''});
              } else {
                console.log('Could not connect to ' + ssid);
                resolve({success: false, error: 'Could not connect to ' + ssid});
              }
            }
          });
        }
      });
    });
  }
}