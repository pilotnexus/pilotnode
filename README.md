# PilotNode

## Installation

First make sure that you don't have an old node version installed.
Node v16.13.0 is required. using n for node version management is recommended.
(nvm can also be used, you need to make sure however that you install the same node version for all users, e.g. pi and root)

### Uninstall nodejs
```
sudo apt-get purge --auto-remove nodejs
```

### 1. Install n
```
# make cache folder (if missing) and take ownership
sudo mkdir -p /usr/local/n
sudo chown -R $(whoami) /usr/local/n
# make sure the required folders exist (safe to execute even if they already exist)
sudo mkdir -p /usr/local/bin /usr/local/lib /usr/local/include /usr/local/share
# take ownership of Node.js install destination folders
sudo chown -R $(whoami) /usr/local/bin /usr/local/lib /usr/local/include /usr/local/share

curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n
bash n lts
```

### 2. Install node
```
nvm install 16.13.1
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