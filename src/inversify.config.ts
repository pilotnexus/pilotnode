import { Container } from 'inversify'
import { buildProviderModule } from 'inversify-binding-decorators'
import { IConnectorFactory } from './connectors/connector.js';
import { DeepstreamConnectorFactory } from './connectors/deepstream/factory.js';
import { KnxConnectorFactory } from './connectors/knx/knx.js';
import { NetvarConnectorFactory } from './connectors/netvar/netvar.js';
import { LocalConnectorFactory } from './connectors/local/local.js';
import { TelegrafConnectorFactory } from './connectors/telegraf/telegraf.js';
import { RuleEngineFactory } from './connectors/rule/rule.js';
import { TelemetryConnectorFactory } from './connectors/telemetry/telemetry.js';
import { ServerConnectorFactory } from './connectors/server/server.js';
import { RosConnectorFactory } from './connectors/ros/ros.js';
import { MqttConnectorFactory } from './connectors/mqtt/mqtt.js';
import { IConnectorValidator } from './connector_validators/connectorvalidator.js';
import { DeepstreamValidator } from './connector_validators/deepstream/validator.js';
import { ServerValidator } from './connector_validators/server/validator.js';

enum NAMED_OBJECTS {
    CONNECTOR = 'ConnectorFactory',
    CONNECTOR_VALIDATOR = 'ConnectorValidator',
    PLUGIN = 'PluginFactory'
}

const globalContainer = new Container({ autoBindInjectable: true, defaultScope: "Singleton" });

globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(DeepstreamConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(KnxConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(NetvarConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(LocalConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(TelegrafConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(RuleEngineFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(TelemetryConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(ServerConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(RosConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(MqttConnectorFactory);

globalContainer.bind<IConnectorValidator>(NAMED_OBJECTS.CONNECTOR_VALIDATOR).to(DeepstreamValidator);
globalContainer.bind<IConnectorValidator>(NAMED_OBJECTS.CONNECTOR_VALIDATOR).to(ServerValidator);

export { globalContainer, NAMED_OBJECTS };
