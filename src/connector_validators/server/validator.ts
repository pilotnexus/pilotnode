import { KnownDirectivesRule } from "graphql";
import { injectable } from "inversify";
import Joi from "joi";
import { ConfigService } from "../../services/configservice";
import { IConnectorValidator } from "../connectorvalidator";

@injectable()
export class ServerValidator implements IConnectorValidator {
  type: string = "server";

  configschema() {
    return Joi.object({
      url: Joi
        .string()
        .description("Server listening URL")
        .default("http://localhost")
        .example("http://0.0.0.0"),
      endpoint: Joi
        .string()
        .description("Endpoint for GraphQL Server")
        .default("/graphql"),
      playground: Joi
        .boolean()
        .description("Enables GraqhQL Playground UI for testing GraqhQL queries")
        .default(false),
      port: Joi
        .number()
        .min(1)
        .max(65535)
        .description("Server Listening Port")
        .default(9000)
        .example(8080),
      apps: Joi.array().items(this.appschema()),
      enableNodeRed: Joi
        .boolean()
        .default(false)
        .description("Enable Node-RED Server"),
      nodered: this.noderedschema()
    });
  }

  private appschema() {
    return Joi.object({
      endpoint: Joi
        .string()
        .required()
        .description("URL Endpoint")
        .example("/"),
      path: Joi
        .string()
        .required()
        .description("Path of the web app (relative to pilotnodes installation)")
        .example("appdir")
    })
  }

  private noderedschema() {
    return Joi.object({
      httpAdminRoot: Joi
        .string()
        .description("Node Red Admin UI endpoint")
        .default("/"),
      httpNodeRoot: Joi
        .string()
        .description("API UI endpoint")
        .default("/api"),
      userDir: Joi
        .string()
        .description("Node-RED user directory")
        .default(ConfigService.basedir),
      flowFile: Joi
        .string()
        .description("Node-RED Flow File")
        .default("flows.json"),
      apiMaxLength: Joi
        .string()
        .description("Maximum Length for API requests")
        .default("50mb")
    })
  }
}