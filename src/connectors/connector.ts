import { ValueGroup, ConnectorConfig, SubValue } from "../value";

export interface IConnector {
  init(): Promise<Function>;
  valuesCreated( values: { [name: string]: ValueGroup } ): Promise<void>; 
  valuesBound( values: { [name: string]: ValueGroup } ): Promise<void>; 

  /**
   * @returns     Return object is merged into configuration and saved. 
   */
  addValue(config: any, val: ValueGroup) : Promise<any>;
  setValue(config: ConnectorConfig, val: ValueGroup, subValue: SubValue, value: any): void;
}

export interface IConnectorFactory {
  type: string;
  create(name: string, config: any): IConnector
}

//export const ConnectorFactoryToken = new Token<IConnectorFactory>("connectors");

