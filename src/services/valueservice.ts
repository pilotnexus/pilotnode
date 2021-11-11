import { injectable, inject } from "inversify";
import { ConnectorConfig, ValueGroup, SubValue, ValueProperties, IConnectorBaseConfig } from "../value";
import { ConfigService } from "./configservice";
import { ConnectorService } from "./connectorservice";
import { validate, validateOrReject, ValidationError } from 'class-validator';
import { RpcService, RpcSignature } from "./rpcservice";
@injectable()
export class ValueService {
  subscriptions: { [name: string]: ConnectorConfig } = {};
  values: { [name: string]: ValueGroup } = {};
  valuelookup: { [name: string]: ValueGroup } = {};
  listener: {
    [name: string]: { func: Function; context: any; triggered: boolean };
  } = {};

  constructor(
    private connectorService: ConnectorService,
    private rpcService: RpcService,
    private config: ConfigService,
  ) {

    let that = this;

    const setValue: RpcSignature = {
      description: "set a PilotNode value",
      params: [
        { name: 'name', description: "name of the PilotNode value to set without paranthesis", required: true },
        { name: 'subValue', description: "Sub Value to set without paranthesis", required: true },
        { name: 'value', description: "value to set", required: true }
      ],
      defaultParam: "value",
      retDescription: "true if successful, false otherwise",
      fn: async (params: any) => {
        if (params.name in that.valuelookup) {
          let vg = that.valuelookup[params.name];
          if (params.subValue in vg.values) {
            vg.values[params.subValue].setValue(params.value, "_valueservice");
            return true;
          }
        }

        return false;
      }
    };
    this.rpcService.expose("sys.values.setValue", setValue); 

    const getValue: RpcSignature = {
      description: "Get a PilotNode value",
      params: [
        { name: 'name', description: "name of the PilotNode value to set without paranthesis", required: true },
        { name: 'subValue', description: "Sub Value to set without paranthesis", required: true },
      ],
      retDescription: "Value of the PilotNode value",
      fn: async (params: any) => {
        if (params.name in that.valuelookup) {
          let vg = that.valuelookup[params.name];
          if (params.subValue in vg.values) {
            vg.values[params.subValue].getValue();
            return true;
          }
        }

        return false;
      }
    };
    this.rpcService.expose("sys.values.getValue", getValue); 
  }

  // depricated, used for recursive loading of old data structure
  /*
  valueIterator(path: string, values: any) {
    for (const value in values) {
      if (typeof values[value]["bindings"] !== "undefined") {
        let valueKey = path + (path !== "" ? "/" : "") + value;
        //TODO CHECK and throw error if not configured!
        let properties = new ValueProperties(values[value]['properties']);
        this.values[valueKey] = new ValueGroup(
          this.config.config.nodeid,
          valueKey,
          values[value]["bindings"],
          values[value]["config"],
          properties
        );
      } else if(typeof values[value] === 'object') {
        this.valueIterator(value, values[value]);
      }
    }
  }
  */

  async bind() {
    for (const name in this.values) {
      let currentValue = this.values[name];

        let boundTo: string[] = [];
        //explicit bindings
        for (const binding in currentValue.bindings) {
          await this.createBinding(
            binding,
            currentValue.bindings[binding],
            currentValue
          );
          boundTo.push(binding);
        }

        for (const connectorName in this.connectorService.autobind) {
          if (boundTo.indexOf(connectorName) === -1) { //yet unbound, autobind to preset
            await this.createBinding(
              connectorName,
              this.connectorService.autobind[connectorName],
              currentValue
            );
          }
        }
      }
  }    

  async createValues() {
    //this.valueIterator("", this.config.config.values);

    for (const value in this.config.config.values) {
        let valueKey = value.replace(/\./g, '/');

        let properties = new ValueProperties(this.config.config.values[value]['properties']);
        try {
          await validateOrReject(properties);
        }
        catch(e) {
          throw new Error(`Value Properties not set correctly on ${value}: ${JSON.stringify(e, null, 2)}`);
        }
        this.values[valueKey] = new ValueGroup(
          this.config.config.nodeid,
          valueKey,
          this.config.config.values[value]["bindings"],
          this.config.config.values[value]["config"],
          properties
        ); //values[value];
        this.valuelookup[value] = this.values[valueKey];
    }
  }

  async createBinding(connectorName: string, config: any, valueGroup: ValueGroup) {
    let connector = this.connectorService.connectors[connectorName];

    //create a copy of the config that can be modified without affecting the config
    let valueConfig = new ConnectorConfig(JSON.parse(JSON.stringify(config)));

    if (connector) {
      let cfg = await connector.addValue(valueConfig, valueGroup);
      if (cfg) {
        for (const prop in cfg) {
          config[prop] = cfg[prop];
        }
      }
    } else {
      console.log(`Connector '${connectorName}' not found.`);
    }
  }

  getValues(): any[] {
    let values = [];
    for (const key in this.valuelookup) {
        let v = this.valuelookup[key];
        let subValues = [];
        for(const subValueKey in v.values) {
            subValues.push({ 
                name: subValueKey,
                properties: v.values[subValueKey].properties
            });
        }
        values.push({
            name: key,
            subValues
        });
    }

    return values;
  }

  async addSubscription<T extends ConnectorConfig>(sub: T): Promise<T> {
    let that = this;
    //that.values[sub.name] = null;

    //watch for changes
    //sub.changed = (value) => {
    //  if (that.values[sub.name] !== value) { //only do something if value changed
    //    that.values[sub.name] = value;

    //    if (that.valuelookup.hasOwnProperty(sub.name)) {
    //      that.valuelookup[sub.name].forEach(notify => {
    //        try {
    //          if (notify.func.call({ values: that.values })) {
    //            if (!that.listener[notify.name].triggered) { //do not retrigger if condition was not false inbetween (don't spam target with notifications)
    //              console.log(`value triggered for notification '${notify.name}', value=${value}`)
    //              if (that.listener.hasOwnProperty(notify.name)) {
    //                that.listener[notify.name].func(notify.name, that.listener[notify.name].context, that.values); //notify listener
    //                that.listener[notify.name].triggered = true;
    //              }
    //            }
    //          } else {
    //            //no notification, condition function returned false
    //            if (that.listener[notify.name].triggered) {
    //              that.listener[notify.name].triggered = false;
    //              console.log(`value UNtriggered for notification '${notify.name}', value=${value}`);
    //            }
    //          }
    //        }
    //        catch(e) {
    //          console.log('error executing condition');
    //        }
    //      });
    //    }
    //  }
    //}

    //that.subscriptions[sub.name] = sub;

    return sub;
  }
}
