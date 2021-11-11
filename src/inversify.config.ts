import { Container } from 'inversify'
import { buildProviderModule } from 'inversify-binding-decorators'
import { IConnectorFactory } from './connectors/connector';
import { DeepstreamConnectorFactory } from './connectors/deepstream/deepstream';
import { KnxConnectorFactory } from './connectors/knx/knx';
import { LocalConnectorFactory } from './connectors/local/local';
import { TelegrafConnectorFactory } from './connectors/telegraf/telegraf';
import { RuleEngineFactory } from './connectors/rule/rule';
import { TelemetryConnectorFactory } from './connectors/telemetry/telemetry';
import { ServerConnectorFactory } from './connectors/server/server';
import { RosConnectorFactory } from './connectors/ros/ros';


enum NAMED_OBJECTS {
    CONNECTOR = 'ConnectorFactory',
    PLUGIN = 'PluginFactory'
}

const globalContainer = new Container({ autoBindInjectable: true, defaultScope: "Singleton"});

globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(DeepstreamConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(KnxConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(LocalConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(TelegrafConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(RuleEngineFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(TelemetryConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(ServerConnectorFactory);
globalContainer.bind<IConnectorFactory>(NAMED_OBJECTS.CONNECTOR).to(RosConnectorFactory);

export { globalContainer, NAMED_OBJECTS };