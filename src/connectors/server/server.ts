import { injectable, inject } from "inversify";
import path from "path";
import fs from "fs";
import { ConnectorConfig, ValueGroup, SubValue, DataType  } from "../../value";
import { ConfigService } from "../../services/configservice";
import { LoggingService, LogLevel } from "../../services/loggingservice";
import { ValueService } from "../../services/valueservice";
import { IConnectorFactory, IConnector } from "../connector";
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
} from "graphql";

const moment = require("moment");
const red = require("node-red");
const express = require("express");
const { ApolloServer } = require("apollo-server-express");
import { createServer } from "http";
import { PilotNodeGraphQLSchema } from "./schema";
import { RpcService } from "../../services/rpcservice";

class ServeApp {
  constructor(public path: string, public endpoint: string) {
  }
}

class ServerConfig {
  url: string = "http://localhost";
  ws: string = "ws://localhost";
  endpoint: string = "/graphql";
  port: number = 9000;
  apps: ServeApp[] = [];

  ruleengine: any =  {
  httpAdminRoot: '/',
  httpNodeRoot: '/api', // /api
  userDir: ConfigService.basedir,
  flowFile: 'flows.json',
  apiMaxLength: '50mb', 
  functionGlobalContext: { // enables global context      
  }
}
  public constructor(init?: Partial<ServerConfig>) {
    Object.assign(this, init);
  }
}

class GraphQLValueConfig extends ConnectorConfig {
  public constructor(init?: Partial<GraphQLValueConfig>) {
    super();
    Object.assign(this, init);
  }
}

@injectable()
export class ServerConnectorFactory implements IConnectorFactory {
  CONNECTOR_CLASS: string = "server";
  AUTOBIND: any = {};
  type = this.CONNECTOR_CLASS;

  constructor(private config: ConfigService, private valueService: ValueService, private rpcService: RpcService,  private log: LoggingService) {}

  create(name: string, connectorConfig: any): IConnector {
    return new ServerConnector(name, new ServerConfig(connectorConfig), this.config, this.valueService, this.rpcService, this.log);
  }
}

@injectable()
export class ServerConnector implements IConnector {

  schema: PilotNodeGraphQLSchema;

  constructor(
    private name: string,
    private serverconfig: ServerConfig,
    private configService: ConfigService,
    private valueService: ValueService,
    private rpcService: RpcService,
    private log: LoggingService
  ) {
    this.schema = new PilotNodeGraphQLSchema(this.name, this.valueService, this.rpcService, this.configService);
  }

  async init() {}

  async addValue(config: any, val: ValueGroup): Promise<any> {
    //val.values[''].getValue()
    this.schema.addValue(val)
  }

  setValue(
    config: ConnectorConfig,
    val: ValueGroup,
    subValue: SubValue,
    value: any
  ) {}

  async valuesCreated(values: { [name: string]: ValueGroup }): Promise<void> {}

  async valuesBound(values: { [name: string]: ValueGroup }): Promise<void> {
    this.startServer(this.schema.generateSchemaAndResolvers(values));
  }


  async startServer(schema: GraphQLSchema) {
    let that = this;

    const url = `${that.serverconfig.url}:${that.serverconfig.port}${that.serverconfig.endpoint}`;
    const apollo = new ApolloServer({
      schema,
      playground: {
        endpoint: url,
      },
      subscriptions: {
        onConnect: (connectionParams: any, webSocket: any, context: any) => {
          // ...
        },
        onDisconnect: (webSocket: any, context: any) => {
          // ...
        },
      }
    });
    
    // Required logic for integrating with Express
    await apollo.start();

    const app = express();
    apollo.applyMiddleware({ app });

    //node red
    if (that.serverconfig.ruleengine) {
      red.init(app, that.serverconfig.ruleengine);
      app.use(that.serverconfig.ruleengine.httpAdminRoot, red.httpAdmin)
      app.use(that.serverconfig.ruleengine.httpNodeRoot, red.httpNode)
    }

    const server = createServer(app);
    //apollo.installSubscriptionHandlers(server); //TODO

    for (let appspec of this.serverconfig.apps) {
      let appPath = path.resolve(appspec.path);
      if (fs.existsSync(appPath)) {
        that.log.log(LogLevel.info, `Serving app (${appPath}) on ${appspec.endpoint}`);
        app.use(appspec.endpoint, express.static(appPath));
    } else {
        that.log.log(LogLevel.error, `Cannot serve app, directory ${appPath} not found.`);
    }
    };

    server.listen({ port: that.serverconfig.port }, () => {
      that.log.log( LogLevel.info, `GraphQL URL: ${that.serverconfig.url}:${that.serverconfig.port}${that.serverconfig.endpoint}`);
      that.log.log( LogLevel.info, `Subscriptions URL: ${that.serverconfig.ws}:${that.serverconfig.port}${that.serverconfig.endpoint}`);
    });

    if (that.serverconfig.ruleengine) {
      red.start();
    }
  }
}
