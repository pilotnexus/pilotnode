# PilotNode

## Prerequisites

You need Node v16.13.0 or higher installed on your system.

First make sure that you don't have an old node version installed.
Using n for node version management is recommended.
(nvm can also be used, you need to make sure however that you install the same node version for all users, e.g. pi and root)

### Uninstall old versions of nodejs
Check if you have node installed:
```
node --version
sudo node --version
```
If you get a node version returned on either of these calls, you need to remove it, otherwise you can proceed with the next step "Install n"

It depends on how you have installed node how the removal process works. If you installed it via apt-get you can purge it like this:

```
sudo apt-get purge --auto-remove nodejs
```
Run `node --version` again to make sure that node is removed (you should get a `command not found` error if you sucessfully removed node)

### Install n
```
# make cache folder (if missing) and take ownership
sudo mkdir -p /usr/local/n
sudo chown -R $(whoami) /usr/local/n
# make sure the required folders exist (safe to execute even if they already exist)
sudo mkdir -p /usr/local/bin /usr/local/lib /usr/local/include /usr/local/share
# take ownership of Node.js install destination folders
sudo chown -R $(whoami) /usr/local/bin /usr/local/lib /usr/local/include /usr/local/share

curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n
```

### Install node
```
bash n 16.13.1
```

## Install Pilotnode
```
npm install -g pilotnode
```

### Remove Pilotnode

```
npm remove -g pilotnode
```

### Register as service
```
sudo pilotnode install-service
```

start PilotNode service:
```
sudo service pilotnode start
```

check if PilotNode service is running:
```
sudo service pilotnode status
```

### Remove PilotNode service

If you want to remove the PilotNode service, you need to stop it first:

```
sudo service pilotnode stop
```

then you can remove the service:

```
sudo pilotnode remove-service
```