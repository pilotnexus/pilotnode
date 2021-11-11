import { Client, ClientChannel } from 'ssh2'
import { ConfigService } from '../../services/configservice';
import { DeepstreamConnector } from './deepstream';
//import { RPCProvider } from '@deepstream/client/dist/rpc/rpc-handler';
//import { RPCResponse } from '@deepstream/client/dist/rpc/rpc-response';
import { v4 as uuid_v4 } from 'uuid';
import { LoggingService, LogLevel } from '../../services/loggingservice';
import { RPCResponse } from '@deepstream/client/dist/src/rpc/rpc-response';


export class SshRpcService {
  config: ConfigService;
  ds: DeepstreamConnector;
  sessions: { [id: string]: { client: Client, stream: ClientChannel } } = {};

  rpc_connect: string;
  rpc_disconnect: string;
  rpc_closed: string;
  rpc_alive: string;
  rpc_stdin: string;
  rpc_stdout: string;

  constructor (config: ConfigService, ds: DeepstreamConnector, private logService: LoggingService) {
    this.config = config;
    this.ds = ds;
     
    this.rpc_connect = `${this.config.config.nodeid}/_ssh/connect`;
    this.rpc_disconnect = `${this.config.config.nodeid}/_ssh/disconnect`;
    this.rpc_closed = `${this.config.config.nodeid}/_ssh/closed`;
    this.rpc_alive = `${this.config.config.nodeid}/_ssh/alive`;
    this.rpc_stdin = `${this.config.config.nodeid}/_ssh/stdin`;
    this.rpc_stdout = `${this.config.config.nodeid}/_ssh/stdout`;

    this.initssh();
  }

  unprovide(name: string) {
    if (this.ds.client?.rpc.providerNames().indexOf(name) !== -1) {
      this.ds.client?.rpc.unprovide(name);
    }
  }

  initssh() {
    const that = this;
    //TODO move to "uninit" function called when shut down
    this.unprovide(this.rpc_connect);
    this.unprovide(this.rpc_disconnect);
    this.unprovide(this.rpc_alive);
    this.unprovide(this.rpc_stdin);

    this.ds.client?.rpc.provide(this.rpc_alive, this.ssh_alive.bind(that));
    this.ds.client?.rpc.provide(this.rpc_stdin, this.ssh_stdin.bind(that));
    this.ds.client?.rpc.provide(this.rpc_disconnect, this.ssh_disconnect.bind(that));
    this.ds.client?.rpc.provide(this.rpc_connect, this.ssh_connect.bind(that));

  }


    //let that = this;
    //client.rpc.unprovide(`${nodeid}/value`);
    //client.rpc.provide(`${nodeid}/value`, async (data, response) => {
    //  //if (that.writers[data.fullpath])
    //  //{
    //  //  response.send(await that.writers[data.fullpath](data.value));
    //  //} else {
    //  //  response.send(false);
    //  //}
    //});

    ////get utc time from this client
    //client.rpc.unprovide(`${nodeid}/utc`);
    //client.rpc.provide(`${nodeid}/utc`, (data, response) => {
    //  response.send(new Date().toUTCString());
    //});

    //client.rpc.unprovide(`${nodeid}/sysinfo`);
    //client.rpc.provide(`${nodeid}/sysinfo`, (data, response) => {
    //  response.send(functions.osinfo());
    //});

    //client.rpc.unprovide(`${nodeid}/openserial`);
    //client.rpc.provide(`${nodeid}/openserial`, (data, response) => {
    //  let baudrate = Number(data.baudrate);
    //  if (baudrate === NaN || baudrate === 0) {
    //    baudrate = 9600;
    //  }
    //});

    //client.rpc.unprovide(`${nodeid}/reverseproxy`);
    //client.rpc.provide(`${nodeid}/reverseproxy`, async (data, response) => {
    //  try {
    //    if (
    //      data.server &&
    //      (Helper.validateDomainName(data.server) ||
    //        Helper.validateIPaddress(data.server)) &&
    //      !isNaN(data.port) &&
    //      Helper.validateLinuxUserName(data.user)
    //    ) {
    //      let remoteproxycmd = `ssh -fNC -R ${data.port}:localhost:22 ${data.user}@${data.server}`;
    //      await execAsync(remoteproxycmd);
    //      that.config.node.remoteproxy = remoteproxycmd;
    //      response.send(true);
    //      return;
    //    }
    //  } catch {}
    //  response.send(false);
    //});

  private getSession(data: {id: string}): { client: Client, stream: ClientChannel }|null{
    if ('id' in data && data.id in this.sessions) {
      return this.sessions[data.id];
    }
    return null;
  }

  ssh_stdin(data: {id: string, data: any}, response: RPCResponse) {
    const session = this.getSession(data);
    if (session) {
      try {
        let stdin = Buffer.from(data.data);
        session.stream.write(stdin);
      }
      catch(e) {
        response.error(e);
      }
      response.send('');
    } else {
      response.error('Session not found');
    }
  }

  ssh_alive(data: {id: string}, response: RPCResponse) {
    const session = this.getSession(data);
    if (session) {
      
    } else {
      response.error('Session not found');
    }
      response.send('');
  }

  ssh_disconnect(data: {id: string}, response: RPCResponse) {
    const session = this.getSession(data);
    if (session) {
      delete this.sessions[data.id];
      session.stream.end('exit\n');
      response.send('');
    } else {
      response.error('Session not found');
    }
  }

  ssh_connect(data: {ip?: string, user: string, password: string}, response: RPCResponse) {
    let that = this;

    try {
    const client = new Client();
    client.on('ready', function() {
      // generate session id

      client.shell(function(err, stream) {
        if (err) {
          response.error(err.message);
          return;
        }
        
        let id = uuid_v4();
        that.logService.log(LogLevel.debug, `ssh session ${id} ready`);
        that.sessions[id] = { client, stream };

        stream.on('close', async () => {
          that.logService.log(LogLevel.debug, `ssh session ${id} closed`);
          delete that.sessions[id];
          client.end();
          try {
            await that.ds.client?.rpc.make(that.rpc_closed, id);
          }
          catch {}
        }).on('data', async (data: any) => {
          try {
            await that.ds.client?.rpc.make(that.rpc_stdout, { id, data });
          }
          catch (e) {
            //TODO
            that.logService.log(LogLevel.debug, `Error trying to make RPC call for stdout.`);
          }
        });

        response.send({sessionid: id} );
        //stream.end('ls -l\nexit\n');
      });
    }).connect({
      host: data.ip ? data.ip : 'localhost',
      port: 22,
      username: data.user,
      password: data.password
    });

  }
  catch(e) {
    if (e instanceof Error) {
      response.send({error: (e as Error).message});
    } else {
      response.send({error: e.toString()});
    }
  }
  }
}