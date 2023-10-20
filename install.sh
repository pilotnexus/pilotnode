#!/bin/bash

# Check if curl is installed
command -v curl >/dev/null 2>&1 || { echo >&2 "curl is required but it's not installed. Installing now..."; sudo apt-get install -y curl; }

# Check if n is already installed
if command -v n >/dev/null 2>&1; then
    echo "n is already installed."
else
    # Make cache folder (if missing) and take ownership
    sudo mkdir -p /usr/local/n
    sudo chown -R $(whoami) /usr/local/n

    # Make sure the required folders exist (safe to execute even if they already exist)
    sudo mkdir -p /usr/local/bin /usr/local/lib /usr/local/include /usr/local/share

    # Take ownership of Node.js install destination folders
    sudo chown -R $(whoami) /usr/local/bin /usr/local/lib /usr/local/include /usr/local/share

    # Download and install n
    curl -L https://raw.githubusercontent.com/tj/n/master/bin/n -o n
fi

bash n 18.12.0

# Check if pilotnode is already installed
if npm list -g --depth=0 | grep pilotnode >/dev/null 2>&1; then
    echo "pilotnode is already installed."
else
    npm install -g pilotnode
fi

# Create pilot directory
if [ ! -d "/etc/pilot" ]; then
    sudo mkdir /etc/pilot
fi

# Check if pilotnode.yml already exists
if [ ! -f "/etc/pilot/pilotnode.yml" ]; then
    # Create a minimal config in /etc/pilot/pilotnode.yml
    cat <<EOL | sudo tee /etc/pilot/pilotnode.yml
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

