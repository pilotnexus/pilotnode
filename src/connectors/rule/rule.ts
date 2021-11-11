import { ConfigService } from "../../services/configservice";
import { injectable } from "inversify";
import { IConnectorFactory, IConnector } from "../connector";
import { LoggingService, LogLevel } from "../../services/loggingservice";
import { ValueGroup } from "../../value";
import { ConnectorConfig } from "../../value";
import { SubValue } from "../../value";
import { RuleValueConfig } from "./rulevalueconfig";

import { resolve } from 'path';
import { Worker } from 'worker_threads';
import { Fact } from "json-rules-engine";
import { ApiService } from "../../services/apiservice";
import { RpcService } from "../../services/rpcservice";

 @injectable()
 export class RuleEngineFactory implements IConnectorFactory {
  type = 'rule-engine';

  constructor(private config: ConfigService, private apiService: ApiService, private log: LoggingService, private rpcService: RpcService) {}

  create(name: string): IConnector {
    return new RuleEngineConnector(name, this.config, this.apiService, this.log, this.rpcService);
  }
}

interface IRule {
  addRule(rule: any): void;
  addFact( id: string, value: any ): void;
  run(): void;
}

@injectable()
export class RuleEngineConnector implements IConnector {

  rules: RuleValueConfig[] = [];

  public constructor(
    private name: string,
    private config: ConfigService,
    private api: ApiService,
    private log: LoggingService,
    private rpcService: RpcService
  ) {
  }

  async init() {

  }

  async runService() : Promise<IRule> {
    const worker = new Worker(resolve(__dirname, 'ruleworker.js'), {
      workerData: {
      }
    });

    worker.on('message', (result: any) => {
      if (result.error) {
        this.log.log(LogLevel.error, 'Rules Engine Error', result.error );
      } else if (result.events) {
        for (let event of result.events) {
          if (event.params.value !== undefined && !isNaN(event.params.index)) {
            // write value
            this.rules[event.params.index].valueGroup.values[SubValue.actualValue].setValue(event.params.value, this.name);
          }
          if (event.params.message) {
            // write message to server
              this.api.insertMessage(event.params.message).catch( reason => {
                this.log.log(LogLevel.error, 'Could not send notification message to Server', reason);
              });
          }
          
        }
      } else if (result.debug) {
        console.log(result.debug);
      }
    });

    worker.on('error', (err: Error) => {
      this.log.log(LogLevel.error, "Rule-Engine worker error: ", err);
    });
    
    worker.on('exit', (code) => {
      this.log.log(LogLevel.error, 'worker thread stopped');
    });

    return {
      addRule: rule => worker.postMessage( { rule }),
      addFact: (id: string, value: any) => worker.postMessage( { fact: { id, value } }),
      run: () => worker.postMessage( { run: true })
    } 
  }

  async valuesCreated(values: { [name: string]: ValueGroup; }): Promise<void> {
  }

  async valuesBound(values: { [name: string]: ValueGroup; }): Promise<void> {
    const ruleEngine = await this.runService();
    let facts: {[value: string]: {id: string, values: any}} = {};

    this.rules.forEach( rule => {
      ruleEngine.addRule( {conditions: rule.conditions, event: rule.event });

      rule.facts.forEach(fact => {
        if (!(fact.path in facts)) {
          facts[fact.path] = {id: fact.path, values:{}};
        }
        facts[fact.path].values[fact.subValue] = null;
      });
    });

    for (const path in values) {
      const value = values[path];
      if (value.fullname in facts) {
        //we need to add listener for all fact subvalues
        for (const subValue in facts[value.fullname].values) {
          value.values[subValue].changed( async (newValue) => {
            try {
            //@ts-ignore
            facts[value.fullname].values[subValue] = newValue;
            ruleEngine.addFact(value.fullname, facts[value.fullname].values );
            ruleEngine.run();
            return true; //we assume it works
            }
            catch {}
            return false;
          }, this.name);
        }
      }
    }
  }

  async addValue(config: any, val: ValueGroup): Promise<any> {
    let ruleValueConfig = new RuleValueConfig(config, val, this.rules.length);
    this.rules.push(ruleValueConfig);

  }

  setValue(config: ConnectorConfig, valueGroup: ValueGroup, subValue: SubValue, value: any): void {
  }

}