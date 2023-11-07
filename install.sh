#!/bin/bash

set -e
set -o pipefail
trap 'echo "An error occurred. Exiting..."; exit 1;' ERR

echo "Checking dependencies..."
check_dependency() {
    command -v $1 >/dev/null 2>&1 || {
        echo >&2 "$1 is required but it's not installed. Installing now...";
        sudo apt-get install -y $1;
    }
}

check_dependency curl

echo "Checking and installing n..."
command -v n >/dev/null 2>&1 || {
    sudo mkdir -p /usr/local/n && sudo chown -R $(whoami) /usr/local/n
    sudo mkdir -p /usr/local/bin /usr/local/lib /usr/local/include /usr/local/share
    sudo chown -R $(whoami) /usr/local/bin /usr/local/lib /usr/local/include /usr/local/share
    curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n && bash n 18.12.0
}

echo "Updating or installing pilotnode..."
if npm list -g --depth=0 | grep pilotnode >/dev/null 2>&1; then
    echo "Updating pilotnode..."
    npm update -g pilotnode
else
    echo "Installing pilotnode..."
    npm install -g pilotnode
fi

echo "Creating directories and files..."
sudo mkdir -p /etc/pilot
if [[ ! -f "/etc/pilot/pilotnode.yml" ]]; then
    cat <<EOL | sudo tee /etc/pilot/pilotnode.yml >/dev/null
connectors:
  - name: server
    type: server
    autobind: {}
    config:
      url: localhost
      ws: ws://localhost
      endpoint: /graphql
      port: 8080
      playground: true

values:
EOL
else
    echo "/etc/pilot/pilotnode.yml already exists. Skipping..."
fi

echo "Installation completed successfully!"
