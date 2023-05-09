

import { injectable, inject } from "inversify";
import path from "path";
import fs from "fs";
import { ConnectorConfig, ValueGroup, SubValue, DataType } from "../../value.js";
import { ConfigService } from "../../services/configservice.js";
import { LoggingService, LogLevel } from "../../services/loggingservice.js";
import { ValueService } from "../../services/valueservice.js";
import { RpcService } from "../../services/rpcservice.js";

import {
    GraphQLBoolean,
    GraphQLFloat,
    GraphQLInt,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
    execute,
    subscribe,
    GraphQLScalarType,
    GraphQLInputObjectType,
} from "graphql";


interface NodeHelper {
    isRoot: boolean;
    name: string;
    fullname: string;
    previous: NodeHelper | null;
    next: NodeHelper[];
    queryfields: any;
    gqlobject: any;
}

export class PilotNodeGraphQLSchema {
    hierachy: NodeHelper = {
        isRoot: true,
        name: "",
        fullname: "",
        previous: null,
        next: [],
        queryfields: {},
        gqlobject: null
    };
    values: NodeHelper[] = [];

    constructor(private name: string, private valueService: ValueService, private rpcService: RpcService, private configService: ConfigService) {
    }

    async addValue(val: ValueGroup): Promise<any> {
        //val.values[''].getValue()
        let path = val.fullname.split("/");
        let currentNode: NodeHelper = this.hierachy;
        let fullname = "";
        for (let node of path) {
            if (fullname) {
                fullname = `${fullname}_${node}`;
            } else {
                fullname = node;
            }
            let foundNode = currentNode.next.find(n => n.fullname === fullname);
            if (!foundNode) {
                let nextNode: NodeHelper = {
                    isRoot: false,
                    name: node,
                    fullname,
                    previous: currentNode,
                    next: [],
                    queryfields: {},
                    gqlobject: null
                };
                currentNode.next.push(nextNode);
                currentNode = nextNode;
            } else {
                currentNode = foundNode;
            }
        };

        this.values.push(currentNode);

        currentNode.queryfields = {};

        for (let subValue in val.values) {
            let type: any = undefined;
            let transform = (value: any) => value;
            switch (val.values[subValue].properties.datatype) {
                case DataType.double: type = GraphQLFloat; break;
                case DataType.int: type = GraphQLFloat; break;
                case DataType.string: type = GraphQLFloat; break;
                case DataType.boolean: type = GraphQLFloat; break;
                case DataType.datetime: type = GraphQLString;
                    transform = (date: any) => {
                        if (date && typeof date.toISOString === 'function') {
                            return date.toISOString();
                        } else {
                            return "";
                        }
                    }
                    break;
                default: type = GraphQLString;
                    transform = (value: any) => JSON.stringify(value);
                    break;
            }

            currentNode.queryfields[subValue] = {
                type,
                resolve: (_: any) => transform(val.values[subValue].getValue()),
            };
        }
    }

    generateSchemaAndResolvers(values: {
        [name: string]: ValueGroup;
    }): GraphQLSchema {
        let valueQueryObject = {
            name: "values",
            fields: {},
        };

        let that = this;
        let queryobjects: { [key: string]: GraphQLObjectType } = {};

        for (let value of this.values) {
            let cur: NodeHelper = value;
            while (cur.previous != null) {
                let allObjectsConstructed = true;
                for (let next of cur.next) {
                    if (!(next.fullname in queryobjects)) {
                        allObjectsConstructed = false;
                    }
                };

                if (!allObjectsConstructed) {
                    break;
                }

                //console.log(`generating value object ${cur.fullname}`);

                let queryfields = cur.next.reduce((acc: any, m) => {
                    acc[m.name] = {
                        type: queryobjects[m.fullname],
                        resolve: (_: any) => "",
                    }
                    return acc;
                }, {});

                queryobjects[cur.fullname] = new GraphQLObjectType({
                    name: cur.fullname,
                    fields: {
                        ...cur.queryfields,
                        ...queryfields,
                    },
                });

                //check if we need to add to the root
                if (cur.previous.isRoot) {

                    let queryRoot: any = valueQueryObject.fields;//this.query.fields;
                    queryRoot[cur.name] = {
                        type: queryobjects[cur.fullname],
                        resolve: (_: any) => "",
                    };
                }

                cur = cur.previous;
            }
        }

        //create query
        let query = {
            name: "Query",
            fields: {},
        };

        const subscribeValue = {
            type: GraphQLString,
            args: {
                name: { type: GraphQLString },
                subValue: { type: GraphQLString }
            },
            resolve: async (source: any, args: any) => {
                if (args.name && args.name in this.valueService.valuelookup) {
                    if (args.subValue in this.valueService.valuelookup[args.name].values) {
                        return this.valueService.valuelookup[args.name].values[args.subValue].getValue()
                    } else {
                        throw new Error('subValue not found');
                    }
                } else {
                    throw new Error('name not found');
                }
            },
            subscribe: async (source: any, args: any) => {
                if (args.name && args.name in this.valueService.valuelookup) {
                    if (args.subValue in this.valueService.valuelookup[args.name].values) {
                        return this.valueService.valuelookup[args.name].values[args.subValue].asyncIterator(that.name, value => value);
                    } else {
                        throw new Error('subValue not found');
                    }
                } else {
                    throw new Error('name not found');
                }
            }
        }

        const setValue = {
            type: GraphQLString,
            args: {
                name: { type: GraphQLString },
                subValue: { type: GraphQLString },
                value: { type: GraphQLString },
            },
            resolve: async (source: any, args: any) => {
                if (args.name && args.name in this.valueService.valuelookup) {
                    if (args.subValue in this.valueService.valuelookup[args.name].values) {
                        if (args.value) {
                            this.valueService.valuelookup[args.name].values[args.subValue].setValue(args.value, that.name);
                            return args.value;
                        } else {
                            throw new Error('value not found')
                        }
                    } else {
                        throw new Error('subValue not found');
                    }
                } else {
                    throw new Error('name not found');
                }
            },
        }

        const getValue = {
            type: GraphQLString,
            args: {
                name: { type: GraphQLString },
                subValue: { type: GraphQLString }
            },
            resolve: async (source: any, args: any) => {
                if (args.name && args.name in this.valueService.valuelookup) {
                    if (args.subValue in this.valueService.valuelookup[args.name].values) {
                        return this.valueService.valuelookup[args.name].values[args.subValue].getValue();
                    } else {
                        throw new Error('subValue not found');
                    }
                } else {
                    throw new Error('name not found');
                }
            },
        }

        const getValueProperties = {
            type: GraphQLString,
            args: {
                name: { type: GraphQLString },
                subValue: { type: GraphQLString }
            },
            resolve: async (source: any, args: any) => {
                if (args.name && args.name in this.valueService.valuelookup) {
                    if (args.subValue in this.valueService.valuelookup[args.name].values) {
                        return JSON.stringify(this.valueService.valuelookup[args.name].values[args.subValue].properties);
                    } else {
                        throw new Error('subValue not found');
                    }
                } else {
                    throw new Error('name not found');
                }
            },
        }


        /*
        const setConfig = {
          type: GraphQLString,
          args: {
            config: { type: GraphQLString },
          },
          resolve: async (source: any, args: any) => {
            if (args.config) {
                //this.configService.saveConfig();
            } else {
              throw new Error('config not found');
            }
          },
        }
        */

        const rpc = {
            type: GraphQLString,
            args: {
                method: { type: GraphQLString },
                params: { type: GraphQLString },
            },
            resolve: async (source: any, args: any) => {
                if (args.method && args.method in this.rpcService.rpcs) {
                    return await JSON.stringify(this.rpcService.rpcs[args.method].fn(JSON.parse(args.params)));
                } else {
                    throw new Error('method not found');
                }
            },
        }

        let subscription = {
            name: "Subscription",
            fields: {
                subscribeValue
            }
        }

        let mutation = {
            name: "Mutation",
            fields: {
                setValue,
                rpc
            }
        }

        //query/values
        let queryRoot: any = query.fields;

        //only add values if there is at least one,
        //schema does not work otherwise
        if (Object.keys(valueQueryObject.fields).length > 0) {
            queryRoot['values'] = {
                type: new GraphQLObjectType(valueQueryObject),
                resolve: (_: any) => "",
            };
        }

        queryRoot['getValue'] = getValue;
        queryRoot['getValueProperties'] = getValueProperties;

        queryRoot['config'] = {
            type: GraphQLString,
            resolve: async (source: any, args: any) => {
                return JSON.stringify(this.configService.config)
            },
        }

        queryRoot['rpcDef'] = {
            type: GraphQLString,
            resolve: async (source: any, args: any) => {
                return JSON.stringify(this.rpcService.getRpcs())
            },
        }

        queryRoot['valueDef'] = {
            type: GraphQLString,
            resolve: async (source: any, args: any) => {
                return JSON.stringify(this.valueService.getValues())
            },
        }

        return new GraphQLSchema({
            query: new GraphQLObjectType(query),
            subscription: new GraphQLObjectType(subscription),
            mutation: new GraphQLObjectType(mutation)
        });
    }
}
