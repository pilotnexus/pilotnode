import { IConnectorBaseConfig, ConnectorConfig, SubValue, ValueGroup } from "../../value";

export interface IRuleValueConfig extends IConnectorBaseConfig {
}

export class RuleValueConfig extends ConnectorConfig {

  conditions: any;
  event: any;
  facts: {path:string, subValue: SubValue}[] = [];

  public constructor(init: Partial<RuleValueConfig>, public valueGroup: ValueGroup, public index: number) {
    super();
    Object.assign(this, init);

    this.getProps(this.conditions);

    //create event format for rule engine
    this.event = { type: 'default', params:  {...this.event, index } };
  }

   getProps (obj: any) {
    for (var property in obj) {
        if (obj.hasOwnProperty(property) && obj[property] != null) {
            if (obj[property].constructor == Object) {
                this.getProps(obj[property]);
            } else if (obj[property].constructor == Array) {
                for (var i = 0; i < obj[property].length; i++) {
                    this.getProps(obj[property][i]);
                }
            } else {
              if (property === 'fact') {
                //console.log(`found fact '${obj[property]}`);
                if (!obj.hasOwnProperty('path')) {
                  //console.log('no path found, adding default')
                  obj.path = `.${SubValue.actualValue}`;
                }
                let path = obj.fact.replace(/\./g, "/");
                let subValue = obj.path[0] === '.' ? obj.path.substr(1) : obj.path;
                this.facts.push({path, subValue});
              }
            }
        }
    }
}
}