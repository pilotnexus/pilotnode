let basedir: string = "/etc/pilot/";
let cfgfile: string = `${basedir}pilotnode.yml`;
let identityfile: string = `${basedir}config.yml`;
let variablefile: string = `${basedir}variables`;
let defaultapiurl: string = "https://gql.pilotnexus.io/v1/query";

export function getBasedir(): string {
    return basedir;
}

export function setBasedir(newBasedir: string): void {
    basedir = newBasedir;
    updatePaths();
}

function updatePaths(): void {
    cfgfile = `${basedir}pilotnode.yml`;
    identityfile = `${basedir}config.yml`;
    variablefile = `${basedir}variables`;
}

export function getCfgfile(): string {
    return cfgfile;
}

export function getIdentityfile(): string {
    return identityfile;
}

export function getVariablefile(): string {
    return variablefile;
}

export function getDefaultapiurl(): string {
    return defaultapiurl;
}

export function setCfgfile(newCfgfile: string): void {
    cfgfile = newCfgfile;
}

export function setIdentityfile(newIdentityfile: string): void {
    identityfile = newIdentityfile;
}

export function setVariablefile(newVariablefile: string): void {
    variablefile = newVariablefile;
}
export function setDefaultapiurl(newDefaultapiurl: string): void {
    defaultapiurl = newDefaultapiurl;
}
