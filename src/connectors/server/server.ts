import { injectable, inject } from "inversify";
import path from "path";
import fs from "fs";
import { ConnectorConfig, ValueGroup, SubValue, DataType } from "../../value.js";
import { ConfigService } from "../../services/configservice.js";
import { LoggingService, LogLevel } from "../../services/loggingservice.js";
import { ValueService } from "../../services/valueservice.js";
import { IConnectorFactory, IConnector } from "../connector.js";
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
import { ApolloServerPluginLandingPageLocalDefault, ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default';

//const moment = require("moment");
import * as red from "node-red";

import express from 'express';
import http from 'http';
import cors from 'cors';

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { createServer } from 'http';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';//

import { PilotNodeGraphQLSchema } from "./schema.js";
import { RpcService } from "../../services/rpcservice.js";

import { getBasedir } from '../../folders.js';

class ServeApp {
    constructor(public path: string, public endpoint: string) {
    }
}

class ServerConfig {
    url: string = "http://localhost";
    endpoint: string = "/graphql";
    playground: Boolean = false;
    port: number = 9000;
    apps: ServeApp[] = [];

    enableNodeRed: Boolean = false;
    nodered: any = {
        httpAdminRoot: '/',
        httpNodeRoot: '/api', // /api
        userDir: getBasedir(),
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

    constructor(private config: ConfigService, private valueService: ValueService, private rpcService: RpcService, private log: LoggingService) { }

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

    async init() {
        let that = this;

        return async () => {
            //TODO!
        }
    }

    async addValue(config: any, val: ValueGroup): Promise<any> {
        //val.values[''].getValue()
        this.schema.addValue(val)
    }

    setValue(
        config: ConnectorConfig,
        val: ValueGroup,
        subValue: SubValue,
        value: any
    ) { }

    async valuesCreated(values: { [name: string]: ValueGroup }): Promise<void> { }

    async valuesBound(values: { [name: string]: ValueGroup }): Promise<void> {
        this.startServer(this.schema.generateSchemaAndResolvers(values));
    }


    async startServer(schema: GraphQLSchema) {
        let that = this;

        const url = `${that.serverconfig.url}:${that.serverconfig.port}${that.serverconfig.endpoint}`;

        const app = express();
        const httpServer = http.createServer(app);

        // Creating the WebSocket server
        const wsServer = new WebSocketServer({
            // This is the `httpServer` we created in a previous step.
            server: httpServer,
            path: '/graphql'
        });
        const serverCleanup = useServer({ schema }, wsServer);
        //plugins
        let plugins = [
            ApolloServerPluginDrainHttpServer({ httpServer }),
            {
                async serverWillStart() {
                    return {
                        async drainServer() {
                            await serverCleanup.dispose();
                        },
                    };
                },
            }
        ];
        if (that.serverconfig.playground) {
            plugins.push(ApolloServerPluginLandingPageLocalDefault());
        } else {
            plugins.push(ApolloServerPluginLandingPageProductionDefault());
        }

        //server
        const server = new ApolloServer({
            schema,
            plugins,
        });


        // Hand in the schema we just created and have the
        // WebSocketServer start listening.


        await server.start();
        app.use('/graphql',
            cors<cors.CorsRequest>(),
            express.json(),
            expressMiddleware(server)
        );


        //node red
        //if (that.serverconfig.enableNodeRed) {
        //    red.init(app, that.serverconfig.nodered);
        //    app.use(that.serverconfig.nodered.httpAdminRoot, red.httpAdmin)
        //    app.use(that.serverconfig.nodered.httpNodeRoot, red.httpNode)

        //    //red.hooks.add()
        //}

        for (let appspec of this.serverconfig.apps) {
            let appPath = path.resolve(appspec.path);
            if (fs.existsSync(appPath)) {
                that.log.log(LogLevel.info, `Serving app (${appPath}) on ${appspec.endpoint}`);
                app.use(appspec.endpoint, express.static(appPath));
            } else {
                that.log.log(LogLevel.error, `Cannot serve app, directory ${appPath} not found.`);
            }
        };

        httpServer.listen({ port: that.serverconfig.port }, () => {
            that.log.log(LogLevel.info, `GraphQL URL: ${that.serverconfig.url}:${that.serverconfig.port}${that.serverconfig.endpoint}`);
        });

        if (that.serverconfig.enableNodeRed) {
            red.start();
        }
    }
}
