import { injectable } from "inversify";
import Joi from "joi";
import { IConnectorValidator } from "../connectorvalidator";

@injectable()
export class DeepstreamValidator implements IConnectorValidator {
  type = 'deepstream';

  configschema() {
    return Joi.object({
      server: Joi
        .string()
        .required()
        .description("Deepstream Server URI")
        .example("localhost:6020")
    });
  }
}