import Joi from "joi";

export interface IConnectorValidator {
  type: string;
  configschema(): Joi.ObjectSchema<any>
}