import { injectable, inject } from "inversify";
import { Engine } from 'json-rules-engine'
import { ConfigService } from './configservice.js';

@injectable()
export class ValueService {
    values: { [name: string]: any; } = {};

    engine: Engine;

    constructor(private valueService: ValueService, private config: ConfigService) {

        this.engine = new Engine()
    }
}
