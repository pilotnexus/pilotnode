import { Container } from "inversify";
//reflect-metadata should be imported 
//before any interface or other imports
//also it should be imported only once
//so that a singleton is created.
import "reflect-metadata";
import { globalContainer } from "../inversify.config.js";

import { should, expect } from 'chai';
import 'mocha';
import { ConfigService, ConfigServiceFactory } from "./configservice.js";
import { RpcService } from "./rpcservice.js";
import { parseJsonSourceFileConfigFileContent } from "typescript";
import { setCfgfile } from '../folders.js';

let configServiceFactory: ConfigServiceFactory;
let configService: ConfigService


describe('RpcService Tests', function() {
    before(async () => {
        setCfgfile('./config.yml');
        configServiceFactory = globalContainer.get(ConfigServiceFactory);
        configService = await configServiceFactory.create();

        globalContainer.bind(ConfigService).toConstantValue(configService);
    })

    it('should parse function signature', () => {
        let rpcService = globalContainer.get(RpcService);

        let result = rpcService.parseMethod('test.method("param1", 2, 3, "param4" ) ');
        expect(result).to.have.property("method", "test.method");
        expect(result).to.have.property("params");
        expect(result.params).to.have.all.members(["\"param1\"", "2", "3", "\"param4\""]);

        result = rpcService.parseMethod('test.method()');
        expect(result).to.have.property("method", "test.method");
        expect(result).to.have.property("params");
        expect(result.params).to.have.all.members([]);

        result = rpcService.parseMethod('test.method');
        expect(result).to.have.property("method", "test.method");
        expect(result).to.have.property("params");
        expect(result.params).to.have.all.members([]);

    });
});
