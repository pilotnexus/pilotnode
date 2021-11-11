import { parentPort, threadId, workerData } from "worker_threads";
import { Engine, Fact } from "json-rules-engine";
import { TelemetryCommand, TelemetryConfig } from "./telemetryconfig";
import axios, { AxiosRequestConfig, AxiosPromise } from "axios";
import https from "https";
import { HttpsAgent } from "agentkeepalive";

export enum LogLevel {
  error,
  warn,
  info,
  verbose,
  debug
}

const engine = new Engine();
const config = new TelemetryConfig(workerData);
const httpsAgent = new HttpsAgent({
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000, // active socket keepalive for 60 seconds
  freeSocketTimeout: 30000, // free socket keepalive for 30 seconds
});

const api = axios.create({
  baseURL: `${config.server}/api/v1/`,
  responseType: "json",
  httpsAgent
});

parentPort?.on("message", async (msg: any) => {
  try {
    switch (msg.cmd) {
      case TelemetryCommand.SEND_TELEMETRY:
        let success: boolean = false;
        try {
          if (config.server) {
            //parentPort?.postMessage({ cmd: TelemetryCommand.LOG, logLevel: LogLevel.error, message: `posting telemetry ${JSON.stringify(data.data)}` });
            let url: string = `${msg.accesstoken}/telemetry`;
            try {
            const { status } = await api.post(url, msg.data);
            if (status == 200) {
              success = true;
            }
          }
          catch {}
          }
        }
        catch  {}
        //parentPort?.postMessage({ cmd: TelemetryCommand.LOG, logLevel: LogLevel.error, message: `telemetry send ${success ? 'successful' : 'unsuccessful'}` });
      break;
      case TelemetryCommand.RPC: //rpc reply
      try {
        let postResult = await api.post(`${msg.data.accesstoken}/rpc/${msg.data.id}`, JSON.stringify(msg.data.response));
      }
      catch {}
      //parentPort?.postMessage({ cmd: TelemetryCommand.LOG, logLevel: LogLevel.info, message: `post result of data ${JSON.stringify(msg.data.response)}: ${JSON.stringify(postResult.status)}` });
      break;
    }
  } catch (error) {
    parentPort?.postMessage({ cmd: TelemetryCommand.LOG, logLevel: LogLevel.error, message: `message receive error ${JSON.stringify(error)}` });
  }
});

async function waitForRpc(accesstoken: string) {
 let rpcUrl = `${accesstoken}/rpc?timeout=20000`;
  while(true) {
    try {
      const { data: response } = await api.get(rpcUrl);
      parentPort?.postMessage({ cmd: TelemetryCommand.RPC, response, accesstoken });
    }
    catch { }
  }
}

for (let device in config.devices) {
  if (config.devices[device].enablerpc) {
    waitForRpc(config.devices[device].accesstoken);
  }
}
