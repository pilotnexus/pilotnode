export interface IGraphQLReply {
  data: any;
}

export class Helper {

  static validateIPaddress(ipaddress: string) : boolean {
    if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress)) {
      return true;
    }
    return false;
  } 

  static validateDomainName(domain: string) : boolean {
    if (/^(([a-zA-Z]{1})|([a-zA-Z]{1}[a-zA-Z]{1})|([a-zA-Z]{1}[0-9]{1})|([0-9]{1}[a-zA-Z]{1})|([a-zA-Z0-9][a-zA-Z0-9-_]{1,61}[a-zA-Z0-9]))\.([a-zA-Z]{2,6}|[a-zA-Z0-9-]{2,30}\.[a-zA-Z]{2,3})$/.test(domain)) {
      return true;
    }
    return false;
  }

  static validateLinuxUserName(user: string) : boolean {
    if (/^[a-z_]([a-z0-9_-]{0,31}|[a-z0-9_-]{0,30}\$)$/.test(user)) {
      return true;
    } else {
      return false;
    }
  }

}