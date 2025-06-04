# Runix Driver Protocol Specification v1.0

This document specifies the communication protocol between the Runix automation engine and external driver executables.

## Overview

Runix Driver Protocol is a bidirectional protocol that enables communication between the Runix engine and external driver executables. The protocol is designed to be:

- **Language-agnostic**: Drivers can be implemented in any programming language
- **Transport-agnostic**: Supports multiple transport mechanisms (WebSockets, HTTP, TCP, etc.)
- **Extensible**: New features can be added without breaking backward compatibility
- **Self-documenting**: Drivers can introspect their capabilities and available actions

## Driver Lifecycle

1. **Discovery**: Runix discovers drivers through manifests in driver directories
2. **Startup**: Runix launches the driver executable with a designated port
3. **Communication**: Runix connects to the driver and communicates using the protocol
4. **Validation**: Runix validates that the driver supports the expected capabilities
5. **Execution**: Runix sends commands to the driver to execute steps
6. **Shutdown**: Runix sends a shutdown command when execution is complete

## Transport Mechanisms

The protocol supports multiple transport mechanisms:

- **WebSockets** (recommended): Bidirectional communication over a WebSocket connection
- **HTTP**: RESTful API communication with JSON request/response bodies
- **TCP**: Raw TCP socket communication with JSON messages
- **Standard I/O**: Communication via stdin/stdout (for simpler drivers)

Drivers should listen on the port specified by the `RUNIX_DRIVER_PORT` environment variable, which is automatically assigned by the Runix engine using ephemeral ports to avoid conflicts.

## Message Format

For WebSocket and TCP transports, messages are JSON objects with the following format:

```json
{
  "id": "uuid-string",   // Correlation ID for request/response pairs
  "type": "request",     // "request" or "response"
  "method": "execute",   // Method name for requests
  "params": {},          // Parameters for the request
  "result": {},          // Result data (for responses)
  "error": {}            // Error information (for error responses)
}
```

For HTTP transport, the same data structure is used in the request and response bodies.

## Required Endpoints

All drivers must implement the following endpoints:

### 1. capabilities

Returns information about the driver's capabilities, supported features, and actions.

**Request:**
```json
{
  "id": "1",
  "type": "request",
  "method": "capabilities",
  "params": {}
}
```

**Response:**
```json
{
  "id": "1",
  "type": "response",
  "result": {
    "name": "WebDriver",
    "version": "1.0.0",
    "description": "Web browser automation driver",
    "author": "Runix Team",
    "protocol": "1.0",
    "features": ["execute", "introspection", "health-check"],
    "actions": [
      {
        "name": "open",
        "description": "Open a URL in the browser",
        "parameters": [
          {
            "name": "url",
            "type": "string",
            "description": "URL to open",
            "required": true
          }
        ]
      },
      // ... other actions ...
    ]
  }
}
```

### 2. initialize

Initializes the driver with configuration options.

**Request:**
```json
{
  "id": "2",
  "type": "request",
  "method": "initialize",
  "params": {
    "config": {
      // Driver-specific configuration options
      "headless": true,
      "timeout": 30000
    }
  }
}
```

**Response:**
```json
{
  "id": "2",
  "type": "response",
  "result": {
    "initialized": true,
    "status": "ready"
  }
}
```

### 3. execute

Executes a driver action with specified parameters.

**Request:**
```json
{
  "id": "3",
  "type": "request",
  "method": "execute",
  "params": {
    "action": "open",
    "args": ["https://example.com"]
  }
}
```

**Response:**
```json
{
  "id": "3",
  "type": "response",
  "result": {
    "success": true,
    "data": {
      "url": "https://example.com",
      "title": "Example Domain"
    }
  }
}
```

### 4. shutdown

Shuts down the driver gracefully.

**Request:**
```json
{
  "id": "4",
  "type": "request",
  "method": "shutdown",
  "params": {}
}
```

**Response:**
```json
{
  "id": "4",
  "type": "response",
  "result": {
    "shutdown": true
  }
}
```

## Optional Endpoints

Drivers may implement these additional endpoints for advanced functionality:

### 5. introspect

Returns detailed information about the driver's capabilities, supported steps, and more.

**Request:**
```json
{
  "id": "5",
  "type": "request",
  "method": "introspect",
  "params": {
    "type": "steps"  // Type of information to retrieve
  }
}
```

**Response:**
```json
{
  "id": "5",
  "type": "response",
  "result": {
    "steps": [
      {
        "id": "open-browser",
        "pattern": "open the browser at (url)",
        "description": "Opens the browser at the specified URL",
        "action": "open",
        "examples": [
          "open the browser at \"https://example.com\""
        ],
        "parameters": [
          {
            "name": "url",
            "description": "The URL to open",
            "type": "string",
            "required": true
          }
        ]
      },
      // ... other steps ...
    ]
  }
}
```

### 6. health

Returns the health status of the driver.

**Request:**
```json
{
  "id": "6",
  "type": "request",
  "method": "health",
  "params": {}
}
```

**Response:**
```json
{
  "id": "6",
  "type": "response",
  "result": {
    "status": "healthy",
    "details": {
      "uptime": 123456,
      "memory": {
        "rss": 45678,
        "heapTotal": 23456,
        "heapUsed": 12345
      }
    }
  }
}
```

## Error Handling

When an error occurs, responses include an error object instead of a result:

```json
{
  "id": "3",
  "type": "response",
  "error": {
    "code": 500,
    "message": "Failed to open URL: connection refused",
    "details": {
      "url": "https://example.com",
      "reason": "ECONNREFUSED"
    }
  }
}
```

### Error Codes

- **400**: Bad request - malformed request or invalid parameters
- **404**: Not found - method or resource not found
- **409**: Conflict - operation cannot be performed in current state
- **500**: Internal error - driver encountered an unexpected error
- **501**: Not implemented - method is not implemented by the driver
- **503**: Service unavailable - driver is not ready to handle requests

## HTTP Transport Specifics

For drivers using the HTTP transport, the following endpoints must be implemented:

- `GET /capabilities` - Get driver capabilities
- `POST /initialize` - Initialize the driver
- `POST /execute` - Execute an action
- `POST /shutdown` - Shut down the driver
- `GET /health` - Check driver health (optional)
- `GET /introspect/steps` - Get supported steps (optional)

## WebSocket Transport Specifics

For WebSocket transport, the driver must:

1. Start a WebSocket server on the port specified by the `RUNIX_DRIVER_PORT` environment variable
2. Accept WebSocket connections from the Runix engine
3. Process JSON messages as specified in the protocol
4. Return responses to the same WebSocket connection

## Driver Manifest

Each driver must provide a `driver.json` manifest file with the following structure:

```json
{
  "name": "WebDriver",
  "description": "Web browser automation driver",
  "version": "1.0.0",
  "author": "Runix Team",
  "license": "MIT",
  "executable": "webdriver",
  "protocol": "websocket",
  "features": ["execute", "introspection", "health-check"],
  "actions": ["open", "click", "enterText", "assertVisible"],
  "steps": [
    {
      "id": "open-browser",
      "pattern": "open the browser at (url)",
      "description": "Opens the browser at the specified URL",
      "action": "open",
      "examples": ["open the browser at \"https://example.com\""]
    },
    // ... other steps ...
  ],
  "category": "web",
  "tags": ["browser", "web", "automation"]
}
```

## Environment Variables

Drivers receive these environment variables when started:

- `RUNIX_DRIVER_PORT`: The ephemeral port number assigned by the engine that the driver should listen on
- `RUNIX_DRIVER_INSTANCE_ID`: A unique ID for this driver instance
- `RUNIX_DRIVER_LOG_LEVEL`: The requested log verbosity (info, debug, trace)

Note: The port is dynamically assigned by the OS to ensure no conflicts between multiple driver instances.

## Security Considerations

1. **Authentication**: For production use, drivers should implement authentication tokens
2. **Validation**: All input parameters should be strictly validated
3. **Local Only**: By default, drivers should only listen on localhost
4. **Resource Limits**: Drivers should implement resource limits to prevent DoS attacks

## Future Extensions

The protocol may be extended in the future to support:

- **Streaming Results**: For long-running operations with progress updates
- **File Transfer**: For sending and receiving files
- **Bi-directional Events**: For pushing events from driver to engine
- **Driver Federation**: For drivers to communicate with each other
