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

- 🚀 **Comprehensive Quickstart**: Get started with both microservices and web automation in one command
- 🌐 **Advanced Web Automation**: Playwright-based web driver with screenshot capture and real browser support
- ☑️ **Cucumber-compatible Syntax**: Write tests in easy-to-understand Gherkin language
- 🔧 **Multiple Drivers**: Web, API, example drivers with extensible architecture
- 📸 **Visual Testing**: Automatic screenshot capture for web automation verification
- 🖥️ **Cross-browser Support**: Chromium, Firefox, and WebKit automation
- 📦 **Database Integration**: Built-in support for major database systems
- 🔄 **Parallel Execution**: Run multiple scenarios concurrently
- 📊 **Detailed Reports**: Generate comprehensive test reports with visual artifacts
- 🧩 **Extensible Architecture**: Add custom drivers and plugins
- 🔄 **CI/CD Integration**: Ready for your continuous integration pipeline
- 💻 **Cross-Platform**: Available as binaries for Windows, macOS, and Linux
- 🎯 **Language Server Protocol**: IDE integration with auto-completion and validation

## 🏗️ Architecture

Runix consists of the following key components:

- **Parser**: Parses Gherkin feature files with AST-based validation
- **Engine**: Executes scenarios and steps with driver communication
- **Drivers**: Standalone executables that implement automation actions
- **Web Driver**: Playwright-based browser automation with visual testing
- **LSP Server**: Language Server Protocol support for IDE integration
- **Database Adapters**: Connect to and interact with various database systems
- **Report Generator**: Creates test result reports with screenshots

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Gherkin    │     │   Engine    │     │   Web Driver    │
│  Parser     │──►  │  Execution  │◄─── │  (Playwright)   │
│ (AST-based) │     │   (LSP)     │     │   Screenshots   │
└─────────────┘     └─────────────┘     └─────────────────┘
                           │                     │
                           ▼                     ▼
            ┌─────────────────────────────┐   ┌─────────────┐
            │   ┌─────────────────────┐   │   │   Visual    │
            │   │ Database Adapters   │   │   │ Artifacts   │
            │   └─────────────────────┘   │   │(Screenshots)│
            │   ┌─────────────────────┐   │   └─────────────┘
            │   │ HTML/JSON Reports   │   │
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
# 🎯 COMPLETE QUICKSTART - Run comprehensive demo with both microservices and web automation
task quickstart

# Alternative quickstart options
task quickstart-simple      # Example driver demo only
task quickstart-web         # Web automation demo only
task quickstart:debug       # Debug mode with verbose logging

# Build commands
task build                  # Build TypeScript source
task build-all             # Build everything including drivers
task build-drivers         # Build driver executables

# Development workflow
task dev                   # Development mode with auto-reload
task run scenarios/example.feature  # Run specific feature file

# Driver development
task create-driver -- my-driver     # Create new driver
task driver:dev -- my-driver        # Complete driver workflow

# Testing
task test                  # All tests
task test:unit            # Unit tests only
task test:integration     # Integration tests only
task test:e2e             # End-to-end tests only
task test:coverage        # All tests with coverage
```

See [Using Task with Runix](./docs/USING_TASK.md) for complete documentation.

### Using npm Scripts

```bash
# Build the project
npm run build

# Run example scenarios
npm run example
npm run driver-example

# Start development environment
npm run dev
```

## 📋 Usage

### 1. Quick Start Demo

Get up and running immediately with the comprehensive demo:

```bash
# This runs both microservices and web automation examples
task quickstart
```

### 2. Create a feature file

Create a file named `web-test.feature`:

```gherkin
Feature: Web Automation Demo

  Scenario: Complete web interaction workflow
    Given open the browser at "https://example.com"
    When take a screenshot "homepage-loaded.png"
    Then element "h1" should be visible
    And element "h1" should contain text "Example Domain"
    And take a screenshot "verification-complete.png"
```

### 3. Run the scenario

```bash
# Run with web driver and screenshot capture
runix run ./web-test.feature --driver=web-driver --driverConfig='{"headless":false,"screenshotDir":"screenshots"}'
```

### 4. View the results

Check the console output, generated `runix-report.json` file, and screenshots in the `screenshots/` directory.

## ⚙️ Advanced Usage

### Web Automation with Screenshots

```bash
# Run web tests with visible browser and screenshots
runix run ./web-tests.feature --driver=web-driver --driverConfig='{"headless":false,"screenshotDir":"screenshots","timeout":10000}'

# Run headless for CI/CD
runix run ./web-tests.feature --driver=web-driver --driverConfig='{"headless":true,"screenshotDir":"artifacts"}'
```

### Using Different Drivers

```bash
# Use the example driver for microservices testing
runix run ./api-tests.feature --driver=example-driver

# Use the Web driver with custom browser
runix run ./web-tests.feature --driver=web-driver --driverConfig='{"browserType":"firefox","headless":true}'
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

## 🌐 Web Automation Features

### Supported Web Actions

```gherkin
# Navigation
Given open the browser at "https://example.com"

# Element interaction
When click the "button" element
And enter "text" into the "input" field

# Verification
Then element "h1" should be visible
And element "h1" should contain text "Welcome"

# Visual testing
And take a screenshot "test-result.png"

# Waiting
And wait for element ".loading" to appear
```

### Browser Configuration

```json
{
  "browserType": "chromium",    // chromium, firefox, webkit
  "headless": false,            // true for CI/CD, false for debugging
  "timeout": 30000,            // Default timeout in milliseconds
  "screenshotDir": "screenshots", // Directory for screenshot storage
  "viewport": {
    "width": 1280,
    "height": 720
  }
}
```

## 📊 Reports and Artifacts

Runix generates comprehensive reports with visual artifacts:

```bash
# Specify custom output locations
runix run ./features/login.feature --report=./reports/login-test-result.json

# Screenshots are automatically saved to the configured directory
# Check the screenshotDir in your driver config
```

Generated artifacts include:
- **JSON Reports**: Detailed test execution results
- **Screenshots**: Visual proof of test execution
- **Execution Logs**: Comprehensive logging with timestamps
- **Error Diagnostics**: Detailed error information with suggestions

## ⚡ Advanced Configuration

You can create a configuration file for complex setups:

```json
{
  "driver": "web-driver",
  "driverConfig": {
    "browserType": "chromium",
    "headless": true,
    "timeout": 30000,
    "screenshotDir": "test-artifacts",
    "viewport": {
      "width": 1920,
      "height": 1080
    }
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
    "formats": ["json", "html"],
    "includeScreenshots": true
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
import { Logger } from 'runix/utils/logger';

async function run() {
  const logger = Logger.getInstance();
  const engine = new RunixEngine({
    driverName: 'web-driver',
    driverConfig: { 
      browserType: 'chromium', 
      headless: true,
      screenshotDir: 'screenshots'
    }
  });
  
  await engine.initialize();
  const results = await engine.runFeature('./features/web-test.feature');
  await engine.shutdown();
  
  logger.info('Test results:', { results });
}

run().catch(err => Logger.getInstance().error('Execution failed:', { error: err.message }));
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

### Web Driver Step Definitions

The web driver provides comprehensive step definitions for browser automation:

```typescript
// Example step definitions available
{
  pattern: "open the browser at {string}",
  action: "open",
  description: "Opens the browser at the specified URL"
},
{
  pattern: "click the {string} element",
  action: "click", 
  description: "Clicks an element on the page"
},
{
  pattern: "enter {string} into the {string} field",
  action: "enterText",
  description: "Enters text into a form field"
},
{
  pattern: "take a screenshot {string}",
  action: "screenshot",
  description: "Takes a screenshot of the current page"
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

# Run web automation tests specifically
task quickstart-web
```

## 🎯 IDE Integration

Runix includes Language Server Protocol (LSP) support for enhanced IDE experience:

- **Auto-completion**: Context-aware step suggestions
- **Real-time validation**: Immediate feedback on step definitions
- **Hover documentation**: Detailed step information
- **Error diagnostics**: Comprehensive error reporting

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🎉 Quick Start Summary

```bash
# 1. Install Task (if you haven't already)
choco install go-task    # Windows
brew install go-task     # macOS

# 2. Clone and setup
git clone https://github.com/user/runix.git
cd runix
npm install

# 3. Run the comprehensive demo
task quickstart

# 4. Enjoy both microservices and web automation examples!
```

This will demonstrate the full power of Runix with both microservices communication and real browser automation, complete with screenshots and detailed reporting.
