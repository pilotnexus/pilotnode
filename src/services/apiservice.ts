import { injectable, inject } from "inversify";
import { AuthService } from "./authservice";
import { ConfigService } from "./configservice";
//import ApolloClient, { gql, InMemoryCache } from 'apollo-boost'
import { ApolloClient, NormalizedCacheObject, InMemoryCache, split, HttpLink, useSubscription } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { WebSocketLink } from '@apollo/client/link/ws';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import jwt_decode from 'jwt-decode'
import { SbcService } from "./sbcservice";
import { v4 as uuid_v4 } from 'uuid';
import { LoggingService, LogLevel } from "./loggingservice";
import { gql } from "apollo-server-express";
import ws from 'ws';
import { RpcService } from "./rpcservice";

interface IActivity {
  id: number;
  name: string;
  payload: any;
  created: string;
  userid: number;
  nodeid: string;
  sent: string;
  response?: any;
  done: boolean;
}


@injectable()
export class ApiService {
  client: ApolloClient<NormalizedCacheObject> | null = null;
  userId: number = -1;

  constructor(private auth: AuthService, private configService: ConfigService, private rpcService: RpcService, private log: LoggingService) {
  }

  async init(): Promise<ApolloClient<NormalizedCacheObject>|null> {
    let that = this;
    if (that.client === null) {
      try {
        const cache = new InMemoryCache();
        //this.client = new ApolloClient({uri: 'https://gql.pilotnexus.io/v1/graphql', cache, fetch: auth.axiosfetch.bind(auth) });
        
        let headers = {"Authorization": await that.auth.token()};

        const httpLink = new HttpLink({
          uri: that.configService.config.graphqlurl,
          fetch: this.auth.axiosfetch.bind(that.auth)
        });
        const wsLink = new WebSocketLink({
          uri: that.configService.config.graphqlwsurl,
          options: {
            reconnect: true,
            connectionParams: () => ({ headers }),
          },
          webSocketImpl: ws
        });
        
        // The split function takes three parameters:
        //
        // * A function that's called for each operation to execute
        // * The Link to use for an operation if the function returns a "truthy" value
        // * The Link to use for an operation if the function returns a "falsy" value
        const splitLink = split(
          ({ query }) => {
            const definition = getMainDefinition(query);
            return (
              definition.kind === 'OperationDefinition' &&
              definition.operation === 'subscription'
            );
          },
          wsLink,
          httpLink,
        );

        that.client = new ApolloClient({ cache, link: splitLink });

        let result = that.client.subscribe({ query:
          gql`subscription {
          pilot_activity(where: {done: {_eq: false}}) {
            id
            name
            created
            nodeid
            payload
            sent
            userid
          }
        }`});

        result.subscribe( async (param) => {
          if (param && param['data'] && param['data']['pilot_activity']) {
            let activities:IActivity[] = param['data']['pilot_activity'];
            for(let activity  of activities) {
              activity.sent = (new Date()).toISOString(); //we are processing
              let payload = activity.payload;
              if (typeof payload === 'object' && 'rpc' in payload ) {
                //check method name
                let method: string = '';
                let params: string = '';
                let data: any = {};
                if (typeof payload['rpc'] === 'string') {
                    method = payload['rpc']; 
                } else if (typeof payload['rpc'] === 'object' && 'method' in payload['rpc']) {
                  method = payload['rpc']['method']; 
                  if ('params' in payload['rpc']) {
                    params = payload['rpc']['params']
                  }
                  if ('data' in payload['rpc']) {
                    data = payload['rpc']['data'];
                  }
                }
                if (method && method in that.rpcService.rpcs) {
                  activity.response = await that.rpcService.call(method, data);

                } else {
                  activity.response = { 'error': 'rpc not found'};
                }

                await that.updateActivity(activity.id, activity.sent, activity.response);

              }
            }
          }
        });
      }
      catch(e) {
        that.log.log(LogLevel.error, `Cannot connect to API: ${JSON.stringify(e)}`);
      }
    }

    return that.client;
  }

  async getOpenActivities() {
  
    try {
      
      const GET_ACTIVITIES = gql`query pilot_activity {
        pilot_activity(where: {response: {_is_null: true}}) {
        id
        name
        created
        nodeid
        payload
        sent
        userid
        }
      }`;
      let result = await this.client?.query({ query: GET_ACTIVITIES});
      
      let activities = result?.data?.pilot_activity;
    }
    catch(e) {
    }
  }

  async updateActivity(id: number, sent: string, response: any): Promise<boolean> {
    try {
      const UPDATE_ACTIVITY = gql`mutation updateActivity($id: Int!, $sent: timestamp, $response: jsonb) {
        update_pilot_activity(where: {id: {_eq: $id}}, _set: {response: $response, sent: $sent, done: true}) {
          affected_rows
        }
      }`;

      let result = await this.client?.mutate({ mutation: UPDATE_ACTIVITY, variables: { id, sent, response}});
      return result?.data?.update_pilot_activity?.affected_rows === 1 ? true : false;
    }
    catch (e) {
      this.log.log(LogLevel.error, e);
    }
    return false;
  }

  async getUserId() {
    if (this.userId === -1) {
    try {
        let decoded: any = jwt_decode(await this.auth.token());
        this.userId = Number(decoded['https://hasura.io/jwt/claims']['x-hasura-user-id']);

    }
    catch {}
    }

    return this.userId;
  }

  async insertMessage(message: any) : Promise<boolean> {
   let userid = await this.getUserId();
      const INSERT_MESSAGE = gql`mutation insertMessage($userid: Int, $message: jsonb, $source: uuid) {
        insert_pilot_message(objects: {userid: $userid, message: $message, source: $source})
          {
            affected_rows
          }
        }
      `;
      let variables = { 
        userid,
        message,
        source: this.configService.config.nodeid
        };

      let result = await this.client?.mutate({ mutation: INSERT_MESSAGE, variables})

      return result?.data?.insert_pilot_message?.returning?.length === 1 ? true : false;
  }

  async nodeupdate(): Promise<any> {
      let userid = await this.getUserId();
      const UPSERT_NODE = gql`mutation upsertNode($nodeid: uuid, $userid: Int, $info: jsonb, $pilotconfig: jsonb, $nodeconfig: jsonb, $mac: String, $ipaddresses: String) {
        insert_pilot_node(objects: {id: $nodeid, userid: $userid, info: $info, pilotconfig: $pilotconfig, nodeconfig: $nodeconfig, mac: $mac, ipaddresses: $ipaddresses}, 
          on_conflict: {constraint: node_pkey, update_columns: [pilotconfig, info, nodeconfig, mac]}) {
            affected_rows
            returning {
              parameters
            }
        }
      }
      `;
      let variables = { nodeid: this.configService.config.nodeid, 
        userid, 
        pilotconfig: {}, 
        nodeconfig: this.configService.config, 
        info: SbcService.staticOsInfoObject(),
        mac: this.configService.toServer.mac,
        ipaddresses: this.configService.toServer.ipaddresses.join(',')};

      let result = await this.client?.mutate({ mutation: UPSERT_NODE, variables})

      return result?.data?.insert_pilot_node?.returning?.length === 1 ? result.data.insert_pilot_node.returning[0]?.parameters : {};
  }
}