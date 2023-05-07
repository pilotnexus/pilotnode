import { validate, IsEnum } from 'class-validator';
import { runInThisContext } from 'vm';
import { threadId } from 'worker_threads';
import { $$asyncIterator } from 'iterall';

export enum DataType {
  boolean = 'boolean',
  int = 'int',
  double = 'double',
  string = 'string',
  datetime = 'datetime',
  object = 'object',
  stream = 'stream'
}

export enum ValueType {
  generic = 'generic',
  temperature = 'temperature',
  timestamp = 'timestamp',
  switch = 'switch'
}

export interface IConnectorBaseConfig {
    access: {[ subValue: string]: { read: boolean, write: boolean} };
}

/// base class to configure Connector properties
export class ConnectorConfig implements IConnectorBaseConfig {
  access: {[ subValue: string]: { read: boolean, write: boolean} }= {};

  public constructor(init?: Partial<ConnectorConfig>) {

    this.access[SubValue.actualValue] = { read: true, write: false };
    this.access[SubValue.targetValue] = { read: false, write: true };
    this.access[SubValue.lastChanged] = { read: true, write: false };

    Object.assign(this, init);
  }
}

export class Value {
  private value: any;
  private parent: ValueGroup;
  private subValue: SubValue;
  private handlers: {[name: string]: { (value?: any, oldvalue?: any): Promise<boolean>; }} = {};
  private resolvers: ((value?: any) => void)[] = [];

  public properties: ValueProperties;

  constructor(parent: ValueGroup, subValue: SubValue, properties: ValueProperties) {
    this.parent = parent;
    this.subValue = subValue;
    this.properties = properties;
  }

  public changed(handler: { (value?: any, oldvalue?: any): Promise<boolean> }, handle: string) : void {
    this.handlers[handle] = handler;
  }

  public async* asyncIterator(handle: string, transform?: (value:any) => any) {
    let that = this;
    if (!transform) {
      transform = (value: any) => value;
    }
    
    yield transform(that.getValue());

    while (true) {
      yield await new Promise<any>(resolve => that.resolvers.push(resolve)); //asyncGetValue();
    }
  }

  //public asyncIterator(handle: string): AsyncIterator<any> {
  //  return new ValueAsyncIterator(handle, this);
  //}


  setValue(value: any, excludeHandle: string) {
    let that = this;

    if (that.properties.isNumber()) {
      value = Number(value);
      if (that.properties.delta !== undefined) {
        if ((value > (that.value - that.properties.delta)) && (value < (that.value + that.properties.delta))) {
          return; //don't update if delta is too small
        }
      }
      if (that.properties.round !== undefined) {
        value = value.toFixed(that.properties.round)
      }
    } else if (that.properties.isBoolean()) {
      if (typeof value === 'string') {
        value = value.trim();
        if (value === 'true' || value === 'on' || value === '1' || value === 'enable') {
          value = true;
        } else {
          value = false;
        }
      } else {
        value = !!value;
      }
    } else if (that.properties.isString()) {
      if (typeof value !== 'string') {
        value = JSON.stringify(value);
      }
    }

    if (value !== that.value) {
      if (that.subValue === SubValue.actualValue) { //changes lastchanged if value is actualvalue
        that.parent.values[SubValue.lastChanged].setValue(new Date(), "");
      }
      // console.log(`setting value of ${this.parent.fullname} (${this.subValue}) ${JSON.stringify(value)}`)
      let oldvalue = that.value;
      that.value = value;

      for(const handle in that.handlers) {
        if (handle !== excludeHandle) {
          that.handlers[handle](that.value, oldvalue);
        }
      }

      var func = undefined;
      while (func = that.resolvers.shift()) {
        func(that.value);
      }
    }
  }

  getValue() {
    return this.value;
  }


  //async iterator implementation
}

export class ValueProperties {

  @IsEnum(DataType)
  //@ts-ignore
  _datatype: DataType;

  @IsEnum(ValueType)
  valuetype: ValueType;

  // round to given number of digits
  round?: number;

  // minimum delta to update value
  // e.g. if delta=5 and value changes from 100 to 104, no update is performed.
  //      however if value changes from 100 to 106 the value is updated.
  // useful for analog readings that change frequently due to noise
  delta?: number;

  set datatype(datatype: DataType) {
    this._datatype = datatype ;

    this._isNumber = false;
    this._isBoolean = false;
    this._isString = false;
    this._isDateTime = false;

    switch(datatype) {
      case DataType.boolean:
        this._isBoolean = true;
      case DataType.datetime:
        this._isDateTime = true;
        break;
      case DataType.double:
      case DataType.int:
        this._isNumber = true;
        break;
      case DataType.string:
        this._isString = true;
        break;
    }
  }

  get datatype() {
    return this._datatype;
  }
  
  _isNumber: boolean = false;
  _isBoolean: boolean = false;
  _isString: boolean = false;
  _isDateTime: boolean = false;

  public constructor(init: Partial<ValueProperties>) {
    Object.assign(this, init);
    //@ts-ignore
    if (!this.valuetype) {
      this.valuetype = ValueType.generic;
    }
  }

  isNumber(): boolean {
    return this._isNumber;
  }

  isBoolean(): boolean {
    return this._isBoolean;
  }

  isString(): boolean {
    return this._isString;
  }
  
  isDateTime(): boolean {
    return this._isDateTime;
  }
}

export enum SubValue {
  properties = 'properties',
  targetValue = 'targetValue',
  actualValue = 'actualValue',
  lastChanged = 'lastChanged'
}
/// ValueGroup groups multiple subvalues (like targetValue and actualValue, see enum SubValue) to ae logical unit with shared properties.
export class ValueGroup {
  public nodeId: string;
  public name: string;
  public bindings: any;
  public path: string;
  public fullname: string;
  public fullNameWithNodeId: string;
  public values: {[key: string]: Value};
  public config: any;
  public description: string;

  constructor(nodeId: string, fullname: string, bindings: any, config: any, valueProperty: ValueProperties, description: string = ''/*, subValues?: string[]*/) {
    this.nodeId = nodeId;
    this.fullname = fullname;
    this.bindings = bindings;
    this.fullNameWithNodeId = `${nodeId}/${fullname}`;
    this.config = config;
    this.description = description;

    let idx = this.fullname.lastIndexOf('/');
    if (idx === this.fullname.length - 1) {
      throw Error("Value name cannot end with '/'");
    }

    if (idx !== -1) {
      this.path = this.fullname.substring(0, idx);
      this.name = this.fullname.substring(idx+1);
    } else {
      this.path = '';
      this.name = this.fullname;
    }

    this.values = {};
    this.values[SubValue.targetValue] = new Value(this, SubValue.targetValue, valueProperty);
    this.values[SubValue.actualValue] = new Value(this, SubValue.actualValue, valueProperty);
    this.values[SubValue.lastChanged] = new Value(this, SubValue.lastChanged, new ValueProperties({datatype: DataType.datetime, valuetype: ValueType.timestamp}));

  }

  setValueProperties(valueProperty: ValueProperties) {
    this.values[SubValue.targetValue].properties = valueProperty;
    this.values[SubValue.actualValue].properties = valueProperty;
  }
}
