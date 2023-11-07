import * as path from 'path';
import { add, remove } from 'os-service'
import fs from "fs-extra";
import { getBasedir } from './folders.js';

import { fileURLToPath } from 'url';

const SERVICE_NAME = 'pilotnode'

export interface IGraphQLReply {
    data: any;
}

export class Helper {

    static validateIPaddress(ipaddress: string): boolean {
        if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress)) {
            return true;
        }
        return false;
    }

    static validateDomainName(domain: string): boolean {
        if (/^(([a-zA-Z]{1})|([a-zA-Z]{1}[a-zA-Z]{1})|([a-zA-Z]{1}[0-9]{1})|([0-9]{1}[a-zA-Z]{1})|([a-zA-Z0-9][a-zA-Z0-9-_]{1,61}[a-zA-Z0-9]))\.([a-zA-Z]{2,6}|[a-zA-Z0-9-]{2,30}\.[a-zA-Z]{2,3})$/.test(domain)) {
            return true;
        }
        return false;
    }

    static validateLinuxUserName(user: string): boolean {
        if (/^[a-z_]([a-z0-9_-]{0,31}|[a-z0-9_-]{0,30}\$)$/.test(user)) {
            return true;
        } else {
            return false;
        }
    }

    static getEnumValues<T extends string | number>(e: any): T[] {
        return typeof e === 'object' ? Object.keys(e).map(key => e[key]) : [];
    }

    static async addService(): Promise<number> {
        return new Promise((resolve) => {
            try {
                var options = { programArgs: ["run"] };
                add(SERVICE_NAME, options, (error: any) => {
                    if (error) {
                        console.error("Error installing service:");
                        console.error(error.toString());
                        resolve(1);
                    } else {
                        console.log('PilotNode service added.');
                        console.log('run \'sudo service pilotnode start\' to start service');
                        resolve(0);
                    }
                });
            }
            catch (e) {
                console.log(e);
                console.error("Error installing service. Do you have root priviliges?");
                resolve(1);
            }
        });
    }

    static async removeService(): Promise<number> {
        return new Promise((resolve) => {
            try {
                remove(SERVICE_NAME, (error: any) => {
                    if (error) {
                        console.error("Error removing service:");
                        console.error(error.toString());
                        resolve(1);
                    } else {
                        console.log('PilotNode service removed.');
                        resolve(0);
                    }
                });
            }
            catch (e) {
                console.log(e);
                console.error("Error removing service. Do you have root priviliges?");
                resolve(1);
            }
        });
    }

    static async checkfs(paths: string[]): Promise<boolean> {
        // check if the base directory exists and has execute permissions
        try {
            let dirstats = await fs.stat(getBasedir());
            if (!dirstats.isDirectory) {
                console.log(`${getBasedir()} is not a directory`);
                return false;
            }
        }
        catch {
            // create
            try {
                await fs.mkdir(getBasedir());
            }
            catch {
                console.log(`Could not create directory ${getBasedir()}.`);
                return false;
            }
        }

        try {
            await fs.access(getBasedir(), fs.constants.X_OK | fs.constants.R_OK | fs.constants.W_OK);
        }
        catch {
            console.log(`Insuciffient access permissions to folder ${getBasedir()}. Please change permissions (r/w/x) of the current user to this folder.`);
            return false;
        }

        for (const p of paths) {
            try {
                if (!await fs.exists(p)) {
                    let parentFolder = path.dirname(p);
                    let dirstats = await fs.stat(parentFolder);
                    if (!dirstats.isDirectory) {
                        console.log(`${getBasedir()} is not a directory`);
                        return false;
                    } else {
                        try {
                            await fs.access(getBasedir(), fs.constants.X_OK);
                        }
                        catch {
                            console.log(`We need execution permissions to directory '${parentFolder}' so we can create '${path.basename(p)}'. Please change permissions to the file.`);
                            return false;
                        }
                    }
                } else {
                    try {
                        await fs.access(p, fs.constants.R_OK | fs.constants.W_OK);
                    }
                    catch {
                        console.log(`We need read/write access to '${p}'. Please change permissions to the file.`);
                        return false;
                    }
                }
            }
            catch (e) {
                console.log('Error when checking permissions: ', e);
                return false;
            }
        }
        return true;
    }

    static async getPackageVersion() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const pathsToCheck = [
            path.resolve(__dirname, '../package.json'),
            path.resolve(__dirname, '../../../package.json'),
        ];

        for (const pathToCheck of pathsToCheck) {
            try {
                const data = await fs.readFile(pathToCheck, 'utf8');
                const packageJson = JSON.parse(data);
                return packageJson.version;
            } catch (error) {
                // Handle error if necessary, e.g. log it or re-throw it
                console.error(`Failed to load ${pathToCheck}:`, error);
            }
        }

        throw new Error('package.json not found');
    }

}
