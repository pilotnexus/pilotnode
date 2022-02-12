# Configuration File

the configuration file is located in /etc/pilot/pilotnode.yml

## YAML Configuration file structure:

```
connectors:
  ...
values:
  ...
rpcs:
  ...
```

## Connectors

Connectors enable you to communicate with internal or external (network) services.
There are a number of predefined available connectors
- Local
  Local resources like files, RAM, CPU, etc.
- Deepstream
  Deepstream.io Service
- KNX
  KNX Service
- MQTT
  MQTT Service
- Netvar
  CoDeSys Network Variable Lists (PLC communication)
- ROS
  Robot Operating System
- Rule
  Rule Engine
- Server
  Local GraphQL and WebApp Server
- Telegraf
  Telegraf Service
- Telemetry
  Thingsboard Service

### Local

#### Watch

Watching a local file for changes:
```
teststr:
    properties:
      datatype: string
    bindings:
      local:
        class: watch
        file: /tmp/text1
        writefile: /tmp/text1
        epoll: false
```
if changes in the variable should also be written to the file, specify `writefile` as well.
If you only want to watch changes made to the file, do not specify `watchfile`.

### Deepstream

### KNX

### MQTT

### Netvar

Netvars bindings require two paramerters:
- index
- type

The index is a 1-based index identifying the variable position
the type is one of the CoDeSys variable types:
-  BOOLEAN
-  WORD
-  STRING
-  WSTRING
-  BYTE
-  DWORD
-  TIME
-  REAL
-  LREAL

#### Examples

```yaml
values:
  emergency:
    properties:
      datatype: boolean
    bindings:
      netvar:
        index: 1
        type: BOOLEAN
  testvalue:
    properties:
      datatype: int
    bindings:
      netvar:
        index: 2
        type: WORD
  teststr1:
    properties:
      datatype: string
    bindings:
      netvar:
        index: 3
        type: STRING
```

### ROS

### Rule

### Server

### Telegraf

### Telemetry

## Values


## RPCS
