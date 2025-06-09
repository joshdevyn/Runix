# Runix Driver Testing Guide

This guide explains how to test your custom Runix drivers to ensure they work correctly with the Runix automation engine.

## Built-in Testing Tools

Runix provides built-in tools to test drivers:

```bash
# Run tests for a specific driver
npm run test-driver ./drivers/my-driver

# Run tests with specific filters
npm run test-driver ./drivers/my-driver -- --pattern="capability tests"
```

## Testing Process

When you run the test-driver command, Runix will:

1. Load your driver metadata from driver.json
2. Start your driver in a separate process
3. Generate test scenarios based on your driver's capabilities
4. Run these tests against your driver
5. Report test results

## Creating Custom Driver Tests

### Unit Tests

```typescript
// tests/unit/my-driver.test.ts
import { MyDriverClass } from '../../drivers/my-driver/src';

describe('MyDriver Unit Tests', () => {
  test('handles action correctly', async () => {
    const driver = new MyDriverClass();
    const result = await driver.executeAction('myAction', ['param1']);
    expect(result.success).toBe(true);
  });
});
```

### Integration Tests

```typescript
// tests/integration/my-driver.test.ts
import { RunixEngine } from '../../src/core/engine';
import { DriverRegistry } from '../../src/drivers/driverRegistry';

describe('MyDriver Integration Tests', () => {
  beforeEach(async () => {
    await DriverRegistry.getInstance().loadDriversFromDirectory('./drivers/my-driver');
  });
  
  test('can be discovered and started', async () => {
    const registry = DriverRegistry.getInstance();
    const driver = registry.getDriver('mydriver');
    expect(driver).toBeDefined();
    
    const instance = await registry.startDriver('mydriver');
    expect(instance).toBeDefined();
    await instance.shutdown();
  });
});
```

### End-to-End Tests

```typescript
// tests/e2e/my-driver.test.ts
import { RunixEngine } from '../../src/core/engine';

describe('MyDriver E2E Tests', () => {
  let engine: RunixEngine;
  
  beforeEach(() => {
    engine = new RunixEngine({
      driverName: 'MyDriver',
      driverConfig: { /* config options */ }
    });
  });
  
  afterEach(async () => {
    await engine.shutdown();
  });
  
  test('can run feature file using my driver', async () => {
    await engine.initialize();
    const results = await engine.runFeature('./tests/fixtures/my-driver-test.feature');
    expect(results.every(r => r.success)).toBe(true);
  });
});
```

## Testing Protocol Compliance

To ensure your driver implements the Runix Driver Protocol correctly, use these tests:

```typescript
// tests/protocol/driver-protocol.test.ts
import { testDriverProtocol } from '../../src/utils/driver-protocol-tester';

describe('Driver Protocol Tests', () => {
  test('driver implements protocol correctly', async () => {
    const results = await testDriverProtocol('./drivers/my-driver');
    expect(results.errors).toHaveLength(0);
    expect(results.compliance).toBe(1.0); // 100% compliance
  });
});
```

## Test Coverage

To generate test coverage reports for your driver:

```bash
npm run test-driver ./drivers/my-driver -- --coverage
```

## Common Issues

### Driver Not Starting

If your driver fails to start during tests, check:
1. All dependencies are installed
2. The command and args in driver.json are correct
3. Your driver handles the RUNIX_DRIVER_PORT environment variable

### Action Failures

If actions fail:
1. Verify your actions return the correct response format
2. Check for error handling in your code
3. Validate parameters are processed correctly

### Protocol Non-Compliance

If protocol tests fail:
1. Verify all required endpoints are implemented
2. Ensure response formats match the specification
3. Check error handling for invalid requests

## Advanced Testing Techniques

### Mocking External Dependencies

If your driver relies on external services, consider mocking them:

```typescript
jest.mock('external-service', () => ({
  doSomething: jest.fn().mockResolvedValue({ success: true })
}));
```

### Testing WebSocket Drivers

For WebSocket drivers, you can test the server directly:

```typescript
import * as WebSocket from 'ws';

test('websocket server handles connections', (done) => {
  // Start driver process first
  const ws = new WebSocket('ws://localhost:9999');
  
  ws.on('open', () => {
    // Test capabilities method
    ws.send(JSON.stringify({
      id: '1',
      type: 'request',
      method: 'capabilities',
      params: {}
    }));
  });
  
  ws.on('message', (data) => {
    const response = JSON.parse(data.toString());
    if (response.id === '1' && response.result) {
      // Connection and capabilities test successful
      ws.close();
      done();
    }
  });
  
  ws.on('error', (err) => {
    done(err);
  });
});
```

### Performance Testing

Test your driver's performance:

```typescript
test('driver handles multiple requests efficiently', async () => {
  const start = Date.now();
  
  // Run 100 actions in parallel
  const actions = Array(100).fill(null).map((_, i) => 
    driver.execute('fastAction', [`test${i}`])
  );
  
  await Promise.all(actions);
  
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
});
```

## Testing Specific Driver Implementations

### Vision Driver Tests

The Vision Driver includes specific tests for its functionalities, such as GPT-4o integration. To run these tests:

1.  **Start the Vision Driver:**
    Open a terminal and navigate to the `drivers/vision-driver` directory. Then, run the driver using npm:
    ```bash
    cd c:\\_Runix\\drivers\\vision-driver
    npm start
    ```
    You should see log output indicating the driver has started, typically listening on port 9003.

2.  **Run the Test Script:**
    Open another terminal and navigate to the root of the Runix project (`c:\\_Runix`). Then, execute the specific test script. For example, to test GPT-4o specific features:
    ```bash
    node c:\\_Runix\\drivers\\vision-driver\\test-gpt4o-specific.js
    ```
    The test script will connect to the running Vision Driver and execute the tests. Look for output indicating test success or failure.

    Other test files for the vision driver may exist in `c:\\_Runix\\drivers\\vision-driver\\` and can be run similarly.

## Common Issues

### Driver Not Starting

If your driver fails to start during tests, check:
1. All dependencies are installed
2. The command and args in driver.json are correct
3. Your driver handles the RUNIX_DRIVER_PORT environment variable

### Action Failures

If actions fail:
1. Verify your actions return the correct response format
2. Check for error handling in your code
3. Validate parameters are processed correctly

### Protocol Non-Compliance

If protocol tests fail:
1. Verify all required endpoints are implemented
2. Ensure response formats match the specification
3. Check error handling for invalid requests
