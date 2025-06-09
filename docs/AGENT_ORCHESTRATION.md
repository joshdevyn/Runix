# AgentDriver Orchestration Guide

## Overview

AgentDriver now supports **Agent Mode Orchestration** - a powerful feature that coordinates vision-driver, system-driver, and ai-driver to automatically complete tasks without direct human intervention.

## How Orchestration Works

The orchestration follows a 5-step cycle that repeats until the task is complete or maximum iterations are reached:

1. **Screenshot** - Takes a screenshot using system-driver
2. **Analyze** - Analyzes the screen content using vision-driver
3. **Decide** - Uses ai-driver to interpret the situation and plan next actions
4. **Execute** - Executes the planned actions using system-driver
5. **Repeat** - Continues until goal is achieved or max iterations reached

## Configuration

### AgentDriverConfig Options

```typescript
interface AgentDriverConfig {
  // ... existing options ...
  maxIterations?: number;     // Maximum orchestration iterations (default: 10)
  iterationDelay?: number;    // Delay between iterations in ms (default: 1000)
}
```

### OrchestrationState

The orchestration state tracks the entire process:

```typescript
interface OrchestrationState {
  goal: string;              // The task goal
  currentIteration: number;  // Current iteration number
  maxIterations: number;     // Maximum iterations allowed
  isComplete: boolean;       // Whether the goal was achieved
  error?: string;           // Any error that occurred
  history: Array<{          // Complete history of all iterations
    iteration: number;
    screenshot?: string;
    analysis?: any;
    plan?: any[];
    actions?: any[];
    results?: any[];
    timestamp: number;
  }>;
}
```

## Supported Actions

### Core Orchestration

- **`orchestrate`** - Main orchestration method that runs the full cycle
- **`takeScreenshot`** - Coordinates screenshot capture via system-driver
- **`analyzeScreen`** - Coordinates screen analysis via vision-driver
- **`planActions`** - Coordinates decision making via ai-driver
- **`executeActions`** - Coordinates action execution via system-driver

### Legacy Actions

All existing AgentDriver actions are still supported and delegate to ai-driver.

## Usage Examples

### Basic Orchestration

```javascript
const agentDriver = new AgentDriver({
  maxIterations: 5,
  iterationDelay: 2000
});

await agentDriver.initialize();

const result = await agentDriver.execute('orchestrate', [
  'Open notepad and type Hello World',
  { maxIterations: 10, iterationDelay: 3000 }
]);

console.log('Success:', result.success);
console.log('Complete:', result.data.isComplete);
console.log('Iterations:', result.data.currentIteration);
```

### Individual Steps

```javascript
// Step-by-step orchestration
const screenshot = await agentDriver.execute('takeScreenshot', []);
const analysis = await agentDriver.execute('analyzeScreen', [screenshot.data.path]);
const plan = await agentDriver.execute('planActions', ['Click on Start menu', analysis.data, []]);
const execution = await agentDriver.execute('executeActions', [plan.data.actions]);
```

### Object-Style Parameters

```javascript
const result = await agentDriver.execute('orchestrate', [{
  goal: 'Complete a web form with test data',
  options: {
    maxIterations: 15,
    iterationDelay: 5000
  }
}]);
```

## Driver Coordination

### System Driver Integration

AgentDriver coordinates with system-driver for:
- Taking screenshots (`takeScreenshot`)
- Executing UI actions (`clickAt`, `typeText`, `pressKey`, etc.)
- Mouse movements (`moveMouse`)

### Vision Driver Integration

AgentDriver coordinates with vision-driver for:
- Screen content analysis (`analyzeScene`)
- UI element detection (`detectUI`)
- Text extraction (`extractText`)
- Image recognition (`findImage`)

### AI Driver Integration

AgentDriver coordinates with ai-driver for:
- Task planning (`planTask`)
- Goal validation (`validateGoalAchievement`)
- Decision making (`analyze`)
- Action sequencing

## Error Handling

The orchestration includes robust error handling:

- **Individual step failures** are logged and tracked in history
- **Driver unavailability** triggers automatic driver restart attempts
- **Timeout protection** prevents infinite loops
- **Iteration limits** ensure bounded execution
- **Detailed logging** provides full visibility into the process

## Best Practices

### Goal Definition

- Be specific and actionable: ✅ "Open calculator and compute 2+2"
- Avoid vague goals: ❌ "Do something useful"
- Include success criteria: ✅ "Open notepad, type 'Hello', and save as test.txt"

### Iteration Management

- Start with lower `maxIterations` for testing (3-5)
- Increase for complex tasks (10-20)
- Use appropriate `iterationDelay` for UI responsiveness (1-5 seconds)

### Error Recovery

- Monitor the `history` array for patterns
- Check individual step success rates
- Adjust parameters based on failure modes

### Performance Optimization

- Use shorter delays for simple tasks
- Increase delays for applications with slow UI
- Monitor driver resource usage for long-running orchestrations

## Troubleshooting

### Common Issues

1. **Driver not available**: Ensure all drivers are properly installed and accessible
2. **Screenshots failing**: Check system permissions and output directory
3. **Vision analysis errors**: Verify screenshot files are valid and accessible
4. **AI planning failures**: Check ai-driver service connection and API keys
5. **Action execution problems**: Verify system-driver permissions for UI automation

### Debug Information

Enable verbose logging to see detailed orchestration steps:

```javascript
const agentDriver = new AgentDriver({
  logLevel: 2, // Verbose logging
  // ... other options
});
```

### Testing

Run the provided examples to verify orchestration functionality:

```bash
node examples/agent-orchestration-demo.js
```

## Architecture Notes

- **No Direct Driver Communication**: All coordination flows through AgentDriver
- **Stateless Drivers**: Individual drivers maintain no orchestration state
- **Fault Tolerance**: Driver failures don't crash the orchestration
- **Extensible Design**: New coordination patterns can be added easily
- **Resource Management**: Drivers are started/stopped as needed

## Future Enhancements

Potential future improvements:
- Parallel action execution
- Dynamic iteration limits based on progress
- Machine learning for action prediction
- Multi-monitor support
- Orchestration templates and presets
