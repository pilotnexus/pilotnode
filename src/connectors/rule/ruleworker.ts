import { parentPort, workerData } from "worker_threads";
import { Engine, Fact } from "json-rules-engine";

const engine = new Engine();

parentPort?.on("message", (data: any) => {
  try {
    if ("rule" in data) {
      engine.addRule(data.rule);
    }
    if ("fact" in data) {
      engine.addFact(data.fact.id, data.fact.value);
    }
    if ("run" in data && data.run) {
      engine
        .run()
        .then((result: any) => {
          if (result.events.length > 0) {
            parentPort?.postMessage({ events: result.events });
          }
          })
        .catch((error: any) => parentPort?.postMessage({ error }));
    }
  } catch (error) {
    parentPort?.postMessage({ error });
  }
});
