import { injectable, inject } from "inversify";
import * as qrcode from "qrcode-terminal";
import chalk from "chalk";
import { Issuer, Client, TokenSet, TokenSetParameters } from "openid-client";
import axios, { AxiosRequestConfig, AxiosPromise, AxiosRequestHeaders } from "axios";
import { ConfigService } from "./configservice.js";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const { log, error } = console;
const grant_type = "urn:ietf:params:oauth:grant-type:device_code";
const {
    ISSUER = "https://amescon.eu.auth0.com/.well-known/openid-configuration",
    CLIENT_ID = "hG0Kh6oMY6A2dMUjyjAbTQPTcd8syl58",
    SCOPE = "openid email offline_access"
} = process.env;

export type AuthServiceFactory = () => Promise<AuthService>;

@injectable()
export class AuthService {
    private issuer: Promise<Issuer<Client>> | null = null;
    private client: Promise<Client> | null = null;

    public disabled: boolean = false;

    constructor(@inject(ConfigService) private config: ConfigService) { }

    async init() {
        try {
            this.issuer = Issuer.discover(ISSUER);
            let issuerInstance = await this.issuer;

            this.client = new Promise<Client>(resolve => {
                resolve(
                    new issuerInstance.Client({
                        client_id: CLIENT_ID,
                        token_endpoint_auth_method: "none"
                    })
                );
            });
        } catch (error) {
            console.log("Error getting OpenID issuer, falling back to offline mode");
            // Set issuer and client to null
            this.issuer = null;
            this.client = null;
            this.disabled = true;
        }
    }
    get tokenSet() {
        return this.config.tokenSet;
    }

    async token(): Promise<string> {
        let that = this;
        try {
            let expires: number =
                typeof that.config?.tokenSet?.expires_in !== "undefined" &&
                    !isNaN(that.config.tokenSet.expires_in)
                    ? that.config.tokenSet.expires_in
                    : 0;

            // refresh if (almost) expired (less than 60 seconds)
            if (expires < 60) {
                let newTokenSet = await (await that.client)?.refresh(
                    that.config.tokenSet
                );
                if (newTokenSet) {
                    newTokenSet.refresh_token = that.config.tokenSet.refresh_token;
                    that.config.tokenSet = newTokenSet;
                }

                await that.config.saveTokenset();
            }
            return `${that.config.tokenSet.token_type} ${that.config.tokenSet.access_token}`;
        } catch (e) {
            //console.log("could not refresh token");
            //console.log(e);
        } //fail silenty and return empty token if it fails
        return "";
    }

    public axiosfetch(input: RequestInfo, init?: RequestInit | undefined) {

        return axiosFetcher(this, input.toString(), init);
    }

    /*
    public async req(req: AxiosRequestConfig): Promise<any> {
      let that = this;
      try {
        req.headers["Authorization"] = await that.token();
  
        return axios(req);
      } catch (e) {
        console.log(e);
      }
    }
    */

    async auth(): Promise<AuthService | null> {
        let that = this;
        if (!that.issuer || !that.client) return null;
        try {
            //log(italic("Starting..."));
            const { token_endpoint, device_authorization_endpoint } = (
                await that.issuer
            ).metadata;

            let request1 = {
                client_id: CLIENT_ID,
                scope: SCOPE,
                node_id: "7b12e113-2f32-4c37-8c64-fc27bba95963", //TODO
                prompt: ""
            };

            if (SCOPE.includes("offline_access")) {
                request1.prompt = "consent";
            }

            //log(bold("\n\nDevice Authorization Request:"));
            //log({ url: device_authorization_endpoint, body: request1 });

            const { data: response } = await axios({
                url: device_authorization_endpoint as string,
                data: request1,
                method: "POST",
                responseType: "json"
            });

            //log(bold("\n\nDevice Authorization Response:"));
            //log(response);
            //log("\n\n");

            log(`Open ${chalk.bold(response.verification_uri)} and enter`);
            log("\n\n");
            log(
                `=======>       ${chalk.bold(
                    response.user_code.split("").join(" ")
                )}       <=======`
            );
            log(
                "\n\nor scan this code with your Camera app to skip entering the code"
            );
            qrcode.generate(response.verification_uri_complete, { small: true });
            log(
                chalk.italic("note: this code expires in %d minutes"),
                response.expires_in / 60
            );

            let request2 = {
                grant_type,
                client_id: CLIENT_ID,
                device_code: response.device_code
            };

            let done;
            let tokenset;

            while (!done && !tokenset) {
                tokenset = await (await that.client)
                    .grant({
                        grant_type,
                        device_code: response.device_code
                    })
                    .catch(err => {
                        switch (err.error) {
                            case "authorization_pending":
                                //log(italic("End-User authorization Pending ..."));
                                return wait(5000);
                                break;
                            case "access_denied":
                                log(chalk.red(chalk.bold(chalk.italic("End-User cancelled the flow"))));
                                done = true;
                                break;
                            case "expired_token":
                                log(chalk.red(chalk.bold(chalk.italic("The flow has expired"))));
                                done = true;
                                break;
                            default:
                                if (err.name === "OpenIdConnectError") {
                                    log(
                                        chalk.red(
                                            chalk.bold(
                                                chalk.italic(
                                                    `error = ${err.error}; error_description = ${err.error_description}`
                                                )
                                            )
                                        )
                                    );
                                    done = true;
                                } else {
                                    throw err;
                                }
                        }
                    });
            }

            if (tokenset) {
                log(chalk.green(chalk.bold("\n\nYour device was sucessfully authorized.")));
                that.config.tokenSet = new TokenSet(tokenset as TokenSetParameters);
                that.config.saveTokenset();
                return that;
            }
        } catch (err) {
            console.log(err);
            error(err);
            process.exit(1);
        }
        return null;
    }
}

async function axiosFetcher(auth: AuthService, url: string, input: any) {
    // Convert the `fetch` style arguments into a Axios style config
    let axios_headers: AxiosRequestHeaders = input.headers ? input.headers : {};

    const config: AxiosRequestConfig = {
        url,
        method: input.method || "GET",
        data: String(input.body),
        headers: axios_headers,
        validateStatus: () => true
    };

    if (!auth.disabled) { //if authentication is not disabled
        let authHeader = await auth.token();
        if (!authHeader) {
            throw Error(`ERROR, access-token could not be aquired, token is ${authHeader}`);
        }

        if (config.headers) {
            config.headers["Authorization"] = authHeader;
        }
    }

    const result = await axios(config);

    // Convert the Axios style response into a `fetch` style response
    const responseBody =
        typeof result.data === `object` ? JSON.stringify(result.data) : result.data;

    const headers = new Headers();
    Object.entries(result.headers).forEach(function ([key, value]) {
        headers.append(key, value as string);
    });

    return new Response(responseBody, {
        status: result.status,
        statusText: result.statusText,
        headers
    });
}
