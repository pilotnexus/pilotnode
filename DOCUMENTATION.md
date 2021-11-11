# Configuration File

the configuration file is located in /etc/pilot/pilotnode.yml

## YAML Configuration file structure:

```
dsserver
pilotapiurl
nodeid
apikey 
name
project
instance
mac
ipaddresses
configmode
subscriptions 
```

### dsserver
The deepstream server to connect to.
example: `dsserver: localhost:6020`

### pilotapiurl
URL of the Pilot API
example: `pilotapiurl: https://mypilot.io/api`

### nodeid
Node id used to authenticate.
This value is set by pilot-config when registering the Node.

### apikey
API key to authenticate.
This value is set by pilot-config when registering the Node.

### name
Name of the node.
This value is set by pilotnode on startup

### project
Name of the project if node is assigned

### instance
Name of the instance if node is assigned

### mac
MAC address of the node.
This value is set by pilotnode on startup

### ipaddresses
A list of ipaddresses of the system.
This value is set by pilotnode on startup

### configmode
'server': Configuration is pulled from the server. If the server is offline, the local configuration file is used
'local': The local configuration file is used, the server is not contacted (not using the my)

### Types
types declare custom types

### variables
A list of variables, see chapter variables.

### subscriptions
A list of subscriptions, see chapter Subscriptions

## Types
Types are used to create named memory structures of other primitive data types
supported primitive types are:
bit, i8, u8, i16, u16, i32, u32

### Name
Sets the name for that type

### Properties
A list of primitive data types defined by name, type and location.
e.g.
```
properties:
  - name: bit0
    type: bit
    offset: 0.0
  - name: bit1
    type: bit
    offset: 0.1
```

## Variables
Variables define location and type

```
variables:
  - name: myvarname
    path: path1/path2
    type: mytype
    location: in
    offset: 0
```

## Subscriptions

Subscriptions enables subscribing to various data sources. For each supported data source there is a separate subscription class.

### Subscription classes

#### File

#### Watch

#### Command

##### Attributes
command
interval
cron
data

command: Command to execute
interval: Interval in miliseconds to run the command
cron: cron style schedule format
e.g. '* * * Jan,Sep Sun' runs on Sundays of January and September

if interval and cron is specified, interval is used and cron attribute is dismissed

#### Notify
  class: notify

  ##### Attributes
  heading
  content
  mininterval
  message
  condition


  ###### heading
  type: string
  Notification Heading
  ###### content
  type: string
  Notification Content

  ###### mininterval
  Minimum interval between message dispatches in seconds.
  An event message is not resent (even when the event is triggered) if the mininterval has not passed since the event message before. 

  ###### message
  Message encoded as object to support multiple languages

  Subscription Example:
  ```
  - name: hightemp
    class: notify
    condition: "{{__temp}} > 70"
    message:
      en:
        heading: Temperature Warning
        content: 'CPU core temperature is {{__temp}}°C'
      de:
        heading: Temperaturwarnung
        content: 'CPU Temparatur ist {{__temp}}°C'
  ```

  ###### condition
  Javascript coded condition. Enclose the condition in double quotes and only use single quotes inside! (no doublequote escaping!)
  Variables can be used refering to subscription names using double-curly braces.
  The condition must result in a true or falsy statement when evaluated

  Predefined variables:
  - __nodeid
    Node UUID of the current node
  - __nodename
    Node Name of the current node
  - __instancename

  - __projectname
    Node of the project it belongs to, if the node is assigned
  - __temp
    CPU core temperature of the CPU (only available on Rasberry Pi) 
  - __du
    Disk Free for all mounted devices (object)
  - __sysinfo
    System Info Data Object (default update rate: 15min)
      freemem: <number> free memory in bytes
      loadavg: <number[]> [1m, 5m, 15m] Array with cpu load average of the last 1, 5 and 15 minutes. The load average is a measure of system activity, calculated by the operating system and expressed as a fractional number. 
      uptime: <number> system uptime in seconds

  Examples:
  ```
subscriptions:
  - name: tmpnotify
    class: notify
    condition: "{{tmp}} == 'alert'"
    heading: "Temp Alert"
    content: "A Temporary Alert was raised on Node {{__nodename}}"
    mininterval: 10
  - name: hightemp
    class: notify
    condition: "{{__temp}} > 70"
    heading: "Temperature Warning"
    content: "Attention, temperature is {{__temp}} on Node {{__nodename}}!"
  ```

#### Emulation