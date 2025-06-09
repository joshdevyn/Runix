# Test Organization

This directory contains all tests for the Runix project, organized by test type and scope.

## Directory Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── drivers/            # Driver-specific unit tests
│   │   ├── ai/            # AI driver unit tests
│   │   ├── vision/        # Vision driver unit tests
│   │   └── system/        # System driver unit tests
│   └── core/              # Core functionality unit tests
├── integration/           # Integration tests between components
│   ├── drivers/          # Driver integration tests
│   └── workflows/        # End-to-end workflow tests
├── e2e/                  # End-to-end system tests
├── fixtures/             # Test data and mock files
├── scenarios/           # Complex test scenarios
└── utils/              # Test utilities and helpers
```

## Test Types

### Unit Tests
- Test individual functions and classes in isolation
- Fast execution, no external dependencies
- Located in `tests/unit/`

### Integration Tests
- Test interactions between components
- May require running services
- Located in `tests/integration/`

### End-to-End Tests
- Test complete user workflows
- Require full system setup
- Located in `tests/e2e/`

## Naming Conventions

- Unit tests: `*.unit.test.js` or `*.test.js`
- Integration tests: `*.integration.test.js`
- End-to-end tests: `*.e2e.test.js`
- Test utilities: `*.helper.js` or `*.util.js`

## Running Tests

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests for specific drivers
npm run test:vision
npm run test:ai
npm run test:system
```

## Test Configuration

- Jest configuration: `jest.config.js`
- Test setup: `setup.ts`
- Environment setup: `env-setup.js`