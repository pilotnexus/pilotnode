import { injectable, inject } from "inversify";
import { ConnectorConfig, ValueGroup, SubValue, ValueProperties, IConnectorBaseConfig } from "../value";
import { ConfigService } from "./configservice";
import { ConnectorService } from "./connectorservice";
import { validate, validateOrReject, ValidationError } from 'class-validator';
import { string } from "yargs";
import { LoggingService, LogLevel } from "./loggingservice";


export interface RpcParam {
  name: string,
  description: string,
  required: boolean
}
export interface RpcSignature {
  fn: (params: any) => Promise<any>;
  description: string;
  params: RpcParam[];
  defaultParam?: string;
  retDescription: string;
}

export class Rpc {
  constructor(public source: string | null,
              public target: string | null, 
              public method: string, 
              public params: any, 
              public timeout: number) {}
}

@injectable()
export class RpcService {
  rpcs: { [name: string]: RpcSignature} = {};

  constructor(
    private connectorService: ConnectorService,
    private loggingService: LoggingService,
    private config: ConfigService
  ) {}

  public expose(method: string, func: RpcSignature, timeout?: number) {
    this.rpcs[method] = func;
  }

  public parseMethod(method: string): {method: string, params: string[]} {
    method = method.trim();
    let paramsIndex = method.indexOf('(');
    let params: string[] = [];
    if (paramsIndex > 0) {
      if (method.endsWith(')')) {
        let tmpparams = method.substr(paramsIndex + 1, method.length-paramsIndex-2).trim()
        if (tmpparams) {
          params = tmpparams.split(',').map(p => p.trim());
        } else {
          params = [];
        }
        method = method.substr(0,paramsIndex);
      } else {
        return {method: "", params: []}; //invalid function signature
      }
    }

    return {method, params}
  }

  public async call(methodWithParams: string, data: any): Promise<any> {

    let {method, params} = this.parseMethod(methodWithParams);

    if (method in this.rpcs) {
      let rpc = this.rpcs[method];

      let paramsObj: any = {};

      params.forEach((value: string, index: number) => {
        if (rpc.params.length > index) {
          paramsObj[rpc.params[index].name] = value;
        }
      });

      //check if all required params are given
      let setDefaultParam = false;
      for(const param in rpc.params) {
        if (!(rpc.params[param].name in paramsObj) && rpc.params[param].required) {
          //ok, lets check if a default param is defined and data is not undefined
          if (rpc.defaultParam === rpc.params[param].name) {
            setDefaultParam = true;
          } else {
            //error, required parameter not found
            this.loggingService.log(LogLevel.error, `RPC call '${method}' is missing required parameter '${rpc.params[param].name}'`);
            return undefined;
          }
        }
      }

      //set default param or object properties
      if (setDefaultParam && rpc.defaultParam) {
        paramsObj[rpc.defaultParam] = data;
      } else {
        if (typeof data === 'object') {
          for (const prop in data) {
            paramsObj[prop] = data[prop];
          }
        }
      }

      try {
        return await this.rpcs[method].fn(paramsObj);
      }
      catch(e) {
        this.loggingService.log(LogLevel.error, `Error executong RPC call ${method}: ${JSON.stringify(e)}`);
      }
    }

    return undefined;
  }

  getRpcs(): any[] {
    let rpcs = [];
    for (const key in this.rpcs) {
      let rpc = this.rpcs[key];
      rpcs.push({ name: key, properties: rpc});
    }

    return rpcs;
  }
}
