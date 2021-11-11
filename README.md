# PilotNode

## Installation

First make sure that you don't have an old node version installed.
Node v14.15.0 is required. I recommend using nvm for node version management.


### 1. Install nvm

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
```

### 2. Install node
```
nvm install 14.15.4
sudo ln -s "$NVM_DIR/versions/node/$(nvm version)/bin/npm" "/usr/local/bin/npm"
sudo ln -s "$NVM_DIR/versions/node/$(nvm version)/bin/node" "/usr/local/bin/node"
```

### Install Pilotnode
```
npm install -g pilotnode
```

### Remove Pilotnode

```
npm remove -g pilotnode
```

### Register as service
```
sudo pilotnode install
```

start service:
```
sudo systemctl start pilotnode
```

check if service is running:
```
sudo systemctl status pilotnode
```

## Remote debugging

Run gulp task copyremote with --host [IP]
```
node --inspect-brk=0.0.0.0:9229 lib/app.js 
```
on the raspberry pi

Then attach to remote in vs code

## config
contains the configuration file for PilotNode (pilotnode.yml) in json format.
This information is updated by pilotnode

## fwconfig
contains all informations regarding firmware configuration. This information is updated by pilot-config.

```
{
    modules []
    plc: {
        config
        variables
    }
}
```

### properties
#### modules
Contains all information about modules

#### plc
contains plc information
##### Properties
###### config
the plc configuration file passed to pilot-config build
###### variables
the plc variables