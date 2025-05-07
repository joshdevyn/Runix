# Runix Driver Development Guide

This guide explains how to create custom drivers for the Runix automation engine.

## Overview

Drivers in Runix are standalone servers that communicate with the Runix engine via a standardized protocol. This means drivers can be implemented in any language and run as separate processes, with no dependency on the Runix codebase.

## Key Concepts

- **Drivers are servers**: Each driver operates as an independent server
- **Protocol-based communication**: Drivers communicate with Runix using a JSON-RPC protocol
- **Multiple transport options**: WebSockets (recommended), stdio, HTTP, or TCP sockets
- **Language agnostic**: Implement in any language that supports the chosen transport

## Creating a WebSocket Driver

### Step 1: Create a Driver Directory

Create a new directory for your driver:

```
mkdir -p drivers/my-driver
```

### Step 2: Create the Driver Configuration File

Create a `driver.json` file that tells Runix how to start your driver:

```json
{
  "name": "MyDriver",
  "command": "node",
  "args": ["my-driver.js"],
  "transport": "websocket",
  "endpoint": "ws://localhost:8080"
}
```

### Step 3: Implement the Driver

Create a script that implements the Runix Driver Protocol. Here's an example in JavaScript:

```javascript
// my-driver.js

const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', function open() {
  console.log('Connected to Runix engine');
});

ws.on('message', function incoming(data) {
  const request = JSON.parse(data);
  handleRequest(request);
});

// Handle JSON-RPC request
async function handleRequest(request) {
  if (!request.id || !request.method) {
    return sendErrorResponse(request.id, 400, 'Invalid request format');
  }

  try {
    switch (request.method) {
      case 'capabilities':
        return sendSuccessResponse(request.id, {
          name: "MyDriver",
          version: "1.0.0",
          description: "My custom automation driver",
          author: "Your Name",
          supportedActions: ["myAction", "myOtherAction"]
        });
      
      case 'initialize':
        return sendSuccessResponse(request.id, { initialized: true });
      
      case 'execute':
        return handleExecute(request.id, request.params?.action, request.params?.args);
      
      case 'shutdown':
        return sendSuccessResponse(request.id, { shutdown: true });
      
      default:
        return sendErrorResponse(request.id, 404, `Method not found: ${request.method}`);
    }
  } catch (err) {
    return sendErrorResponse(request.id, 500, err.message);
  }
}

// Handle execute requests
async function handleExecute(id, action, args) {
  switch (action) {
    case 'myAction':
      // Implement action logic here
      return sendSuccessResponse(id, { 
        success: true,
        data: { result: `Executed myAction with ${args.join(', ')}` }
      });
    
    case 'myOtherAction':
      // Implement action logic here
      return sendSuccessResponse(id, { 
        success: true,
        data: { result: `Executed myOtherAction with ${args.join(', ')}` }
      });
    
    default:
      return sendErrorResponse(id, 400, `Unknown action: ${action}`);
  }
}

// Send success response
function sendSuccessResponse(id, result) {
  const response = {
    id,
    type: 'response',
    result
  };
  
  ws.send(JSON.stringify(response));
}

// Send error response
function sendErrorResponse(id, code, message, details) {
  const response = {
    id,
    type: 'response',
    error: {
      code,
      message,
      details
    }
  };
  
  ws.send(JSON.stringify(response));
}
```

## Creating Drivers in Other Languages

You can implement drivers in any language that can communicate over WebSockets (or other transport mechanisms like HTTP). Here are examples in different languages:

### Python Example

```python
import json
import asyncio
import websockets

async def handle_request(websocket, path):
    async for message in websocket:
        request = json.loads(message)
        id = request.get('id')
        method = request.get('method')
        params = request.get('params', {})
        
        if not id or not method:
            await send_error(websocket, id, 400, "Invalid request format")
            continue
        
        try:
            if method == "capabilities":
                await send_success(websocket, id, {
                    "name": "MyPythonDriver",
                    "version": "1.0.0",
                    "description": "Python example driver",
                    "author": "Runix Team",
                    "supportedActions": ["sayHello", "add"]
                })
            elif method == "initialize":
                await send_success(websocket, id, {"initialized": True})
            elif method == "execute":
                action = params.get("action")
                args = params.get("args", [])
                
                if action == "sayHello":
                    name = args[0] if args else "World"
                    await send_success(websocket, id, {
                        "success": True,
                        "data": {"message": f"Hello, {name}!"}
                    })
                elif action == "add":
                    if len(args) < 2:
                        await send_error(websocket, id, 400, "add requires two arguments")
                    else:
                        result = float(args[0]) + float(args[1])
                        await send_success(websocket, id, {
                            "success": True,
                            "data": {"result": result}
                        })
                else:
                    await send_error(websocket, id, 404, f"Unknown action: {action}")
            elif method == "shutdown":
                await send_success(websocket, id, {"shutdown": True})
                await websocket.close()
            else:
                await send_error(websocket, id, 404, f"Unknown method: {method}")
        except Exception as e:
            await send_error(websocket, id, 500, str(e))

async def send_success(websocket, id, result):
    response = {
        "id": id,
        "type": "response",
        "result": result
    }
    await websocket.send(json.dumps(response))

async def send_error(websocket, id, code, message, details=None):
    response = {
        "id": id,
        "type": "response",
        "error": {
            "code": code,
            "message": message,
            "details": details
        }
    }
    await websocket.send(json.dumps(response))

start_server = websockets.serve(handle_request, "localhost", 8080)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
```

## HTTP Transport Drivers

For drivers that use HTTP transport instead of WebSockets, you need to run them as HTTP servers. Here's how to configure such a driver:

### driver.json for an HTTP driver

```json
{
  "name": "HttpDriver",
  "transport": "http",
  "endpoint": "http://localhost:8080"
}
```

The driver should expose HTTP endpoints that match the Runix Driver Protocol methods, such as:

- `GET /capabilities` - Return driver capabilities
- `POST /initialize` - Initialize the driver
- `POST /execute` - Execute an action
- `POST /shutdown` - Shut down the driver

## Best Practices

1. **Error Handling**: Always handle errors gracefully and return appropriate error responses
2. **Logging**: Use stderr for logging so it doesn't interfere with the protocol communication
3. **Documentation**: Document your driver's supported actions and parameters
4. **Configuration**: Make your driver configurable to support different environments
5. **Testing**: Test your driver independently before integrating with Runix

## Using Your Driver

Once your driver is implemented and placed in the correct directory, it will be automatically discovered and registered by Runix. You can then use it in your feature files:

```bash
runix run features/my-feature.feature --driver=MyDriver
```
