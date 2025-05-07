# Runix

<div align="center">
    <img src="https://via.placeholder.com/200x200" alt="Runix Logo" width="200" height="200">
    <h3>Modern Automation Engine for Behavior-Driven Development</h3>
</div>

### THIS IS CURRENTLY A WIP AND HAS HAD FILES REMOVED THAT DO NOT ALLOW IT TO BUILD. DEMONSTRATION PURPOSES ONLY. 05/02/2025

[![CI](https://github.com/user/runix/actions/workflows/ci.yml/badge.svg)](https://github.com/user/runix/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/runix.svg)](https://badge.fury.io/js/runix)

## 📖 Overview

Runix is a powerful, extensible automation engine that runs behavior-driven scenarios written in Gherkin syntax. It's designed with modularity at its core, allowing seamless automation of web interactions, API testing, database operations, and more using natural language descriptions.

## ✨ Features

- ☑️ **Cucumber-compatible Syntax**: Write tests in easy-to-understand Gherkin language
- 🌐 **Multiple Drivers**: Web, API, and custom driver support
- 📦 **Database Integration**: Built-in support for major database systems
- 🔄 **Parallel Execution**: Run multiple scenarios concurrently
- 📊 **Detailed Reports**: Generate comprehensive test reports
- 🧩 **Extensible Architecture**: Add custom drivers and plugins
- 🔄 **CI/CD Integration**: Ready for your continuous integration pipeline
- 💻 **Cross-Platform**: Available as binaries for Windows, macOS, and Linux

## 🏗️ Architecture

Runix consists of the following key components:

- **Parser**: Parses Gherkin feature files
- **Engine**: Executes scenarios and steps
- **Drivers**: Standalone executables that implement automation actions
- **Database Adapters**: Connect to and interact with various database systems
- **Report Generator**: Creates test result reports

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Gherkin    │     │   Engine    │     │   Drivers   │
│  Parser     │──►  │  Execution  │◄─── │ (Web, API)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
            ┌─────────────────────────────┐
            │   ┌─────────────────────┐   │
            │   │ Database Adapters   │   │
            │   └─────────────────────┘   │
            │   ┌─────────────────────┐   │
            │   │      Reports        │   │
            │   └─────────────────────┘   │
            └─────────────────────────────┘
```

## 🚀 Installation

### Using npm

```bash
npm install -g runix
```

### Using Binaries

Download the appropriate binary for your platform from the [releases page](https://github.com/user/runix/releases).

### Building from Source

```bash
# Clone the repository
git clone https://github.com/user/runix.git
cd runix

# Install dependencies
npm install

# Install Task (optional, for better development workflow)
choco install go-task    # Windows
brew install go-task     # macOS

# Build the project
task build  # or npm run build

# Create binaries (optional)
task bundle  # or npm run bundle
```

## 🛠 Development Quick Start

### Using Task (Recommended)

```bash
# Build the project
task build

# Run a simple test scenario
task run:example

# Start the development environment
task dev

# Create a new driver
task create-driver -- my-driver

# Complete driver development workflow
task driver:dev -- my-driver
```

See [Using Task with Runix](./docs/USING_TASK.md) for complete documentation.

### Using npm Scripts

```bash
# Build the project
npm run build

# Run a simple test scenario
npm run example

# Start the development environment
npm run dev
```

### Testing

```bash
# Using Task
task test               # All tests
task test:unit          # Unit tests only
task test:integration   # Integration tests only
task test:e2e           # End-to-end tests only
task test:coverage      # All tests with coverage

# Using npm
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:all
```

## 📋 Usage

### 1. Create a feature file

Create a file named `login.feature`:

```gherkin
Feature: User Authentication

  Scenario: Successful login
    Given I open the browser at "https://example.com/login"
    When I enter "admin" into the "username" field
    And I enter "password123" into the "password" field
    And I click the "login" button
    Then I should see "Welcome, admin"
```

### 2. Run the scenario

```bash
runix run ./login.feature
```

### 3. View the results

Check the console output and the generated `runix-report.json` file.

## ⚙️ Advanced Usage

### Using Different Drivers

```bash
# Use the API driver
runix run ./api-tests.feature --driver=ApiDriver

# Use the Web driver with custom configuration
runix run ./web-tests.feature --driver=WebDriver --driverConfig='{"headless":true,"timeout":10000}'
```

### Database Integration

```bash
# Run with database connection
runix run ./db-tests.feature --driverConfig='{"dbType":"postgres","host":"localhost","username":"user","password":"pwd","database":"testdb"}'
```

### Running Specific Tags

```bash
# Run scenarios with specific tags
runix run ./features/ --tags=@smoke,@critical
```

### List Available Drivers

```bash
runix list-drivers
```

## 📊 Reports

Runix generates detailed reports of test executions:

```bash
# Specify a custom report path
runix run ./features/login.feature --report=./reports/login-test-result.json
```

## ⚡ Advanced Configuration

You can create a configuration file for complex setups:

```json
{
  "driver": "WebDriver",
  "driverConfig": {
    "browser": "chrome",
    "headless": true,
    "timeout": 30000
  },
  "database": {
    "type": "postgres",
    "host": "localhost",
    "port": 5432,
    "username": "testuser",
    "password": "password",
    "database": "testdb"
  },
  "reporting": {
    "outputDir": "./reports",
    "formats": ["json", "html"]
  },
  "parallelScenarios": true
}
```

And run with:

```bash
runix run ./features --config=./runix.config.json
```

## 📚 API Reference

Runix provides a JavaScript/TypeScript API for programmatic usage:

```typescript
import { RunixEngine, DriverRegistry } from 'runix';

async function run() {
  const engine = new RunixEngine({
    driverName: 'WebDriver',
    driverConfig: { browser: 'chrome', headless: true }
  });
  
  await engine.initialize();
  const results = await engine.runFeature('./features/login.feature');
  await engine.shutdown();
  
  console.log(results);
}

run().catch(console.error);
```

## 🔌 Extending Runix

### Creating Custom Drivers

You can extend Runix with custom drivers to automate any system. See the [Driver Development Guide](./docs/DRIVER_DEVELOPMENT.md) for more information.

```typescript
import { BaseDriver, DriverCapabilities } from 'runix';

export class MyCustomDriver extends BaseDriver {
  getCapabilities(): DriverCapabilities {
    return {
      name: 'MyCustomDriver',
      description: 'Custom automation driver',
      version: '1.0.0',
      supportedActions: ['customAction'],
      author: 'Your Name'
    };
  }
  
  async execute(step) {
    // Implementation
  }
}
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Test the CLI
npm run test-cli

# Run end-to-end tests
npm run test:e2e
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
