# Runix

<div align="center">
    <img src="src/Runix.png" alt="Runix Logo" width="200" height="200">
    <h3>Modern Automation Engine for Behavior-Driven Development</h3>
</div>

[![CI](https://icons.iconarchive.com/icons/simpleicons-team/simple/24/github-actions-icon.png)](https://github.com/user/runix/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/runix.svg)](https://badge.fury.io/js/runix)

## 📖 Overview

Runix is a powerful, extensible automation engine that runs behavior-driven scenarios written in Gherkin syntax. It's designed with modularity at its core, allowing seamless automation of web interactions, API testing, database operations, and more using natural language descriptions.

## ✨ Features

- 🤖 **Automatic Driver Loading**: Zero-configuration setup - automatically discovers and loads all available drivers
- 🔀 **Dynamic Step Routing**: Intelligent pattern matching routes steps to the appropriate driver automatically
- 🌐 **Multi-Driver Workflows**: Seamlessly combine steps from different drivers in a single feature file
- 🚀 **Comprehensive Quickstart**: Get started with both microservices and web automation in one command
- 🌐 **Advanced Web Automation**: Playwright-based web driver with screenshot capture and real browser support
- ☑️ **Cucumber-compatible Syntax**: Write tests in easy-to-understand Gherkin language
- 🔧 **Multiple Drivers**: Web, API, system, vision, and AI drivers with extensible architecture
- 📸 **Visual Testing**: Automatic screenshot capture for web automation verification
- 🖥️ **Cross-browser Support**: Chromium, Firefox, and WebKit automation
- 📦 **Database Integration**: Built-in support for major database systems
- 🔄 **Parallel Execution**: Run multiple scenarios concurrently
- 📊 **Detailed Reports**: Generate comprehensive test reports with visual artifacts
- 🧩 **Plugin Architecture**: Easy driver development and deployment with hot-loading
- 🤖 **AI-Driven Automation**: Real OpenAI integration with agent, ask, and editor modes for intelligent task completion
- 🧠 **AI Orchestration**: Intelligent step generation and workflow optimization (coming soon)
- 🏢 **Enterprise Scaling**: Distributed driver execution for large-scale automation
- 🔄 **CI/CD Integration**: Ready for your continuous integration pipeline
- 💻 **Cross-Platform**: Available as binaries for Windows, macOS, and Linux
- 🎯 **Language Server Protocol**: IDE integration with auto-completion and validation

## 🏗️ Architecture

Runix features a revolutionary **automatic driver loading** system with intelligent step routing:

- **Zero Configuration**: No more manual driver specification - Runix automatically discovers all available drivers
- **Dynamic Routing**: Steps are intelligently routed to the appropriate driver based on pattern matching
- **Multi-Driver Workflows**: Seamlessly combine steps from different drivers in a single feature file
- **Enterprise Scaling**: Distributed driver execution for large-scale automation

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  Gherkin    │     │  Auto-Discovery     │     │   Web Driver    │
│  Parser     │──►  │   Engine with       │◄─── │  (Playwright)   │
│ (AST-based) │     │ Dynamic Routing     │     │   Screenshots   │
└─────────────┘     └─────────────────────┘     └─────────────────┘
                           │                              │
                           ▼                              ▼            ┌─────────────────────────────┐    ┌─────────────────┐
            │     Driver Ecosystem        │    │   AI Driver     │
            │ ┌─────────────────────────┐ │    │ (OpenAI GPT-3.5)│
            │ │    System Driver        │ │    │ Ask/Agent/Editor│
            │ │  (File Operations)      │ │    │ + Orchestration │
            │ └─────────────────────────┘ │    └─────────────────┘
            │ ┌─────────────────────────┐ │    ┌─────────────────┐
            │ │    Vision Driver        │ │    │   Visual        │
            │ │  (OCR & UI Detection)   │ │    │   Artifacts     │
            │ └─────────────────────────┘ │    │ (Screenshots)   │
            │ ┌─────────────────────────┐ │    └─────────────────┘
            │ │   Database Adapters     │ │
            │ │   HTML/JSON Reports     │ │
            │ └─────────────────────────┘ │
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

Create a file named `multi-driver-demo.feature` to showcase the power of automatic driver loading:

```gherkin
Feature: Multi-Driver Automation Demo
  Demonstrate seamless integration between different automation drivers

  Scenario: Complete end-to-end workflow with multiple drivers
    # System Driver: File operations
    Given I create file "test-data.txt" with content "Hello from Runix!"
    And I read file "test-data.txt"
    
    # Web Driver: Browser automation
    When I open the browser at "https://httpbin.org/forms/post"
    And I enter "Runix User" into the "custname" field
    And I take a screenshot "form-filled.png"
    
    # Vision Driver: OCR and visual verification
    Then I extract text from screenshot
    And I analyze scene in screenshot    # AI Driver: Intelligent assistance and orchestration
    And I ask "What automation steps were just completed?"
    
    # System Driver: Cleanup
    Finally I delete file "test-data.txt"
```

### 3. Run the scenario

```bash
# 🚀 NEW: Zero configuration required! 
# Runix automatically discovers and loads all drivers
runix run ./multi-driver-demo.feature

# 🎯 Old way (still supported for specific driver selection):
# runix run ./web-test.feature --driver=web-driver --driverConfig='{"headless":false}'
```

**What happens automatically:**
1. 🔍 **Driver Discovery**: Runix finds all available drivers (web, system, vision, AI, etc.)
2. 🧠 **Pattern Matching**: Each step is intelligently routed to the correct driver
3. 🚀 **Lazy Loading**: Only initializes drivers that are actually needed
4. ⚡ **Execution**: Seamless multi-driver workflow execution

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

## 🤖 AI-Powered Automation

Runix includes an advanced AI driver with real OpenAI integration for intelligent automation and assistance:

### Current AI Capabilities ✅

**Working Now**: The AI driver provides direct question/answer functionality and basic task assistance through real OpenAI API integration.

**Coming Soon**: Advanced orchestration features including automatic workflow generation, multi-driver coordination, and intelligent step sequencing.

### AI CLI Commands

The AI system operates in multiple modes accessible through the CLI:

```bash
# Agent Mode - Autonomous task completion
runix ai agent "Complete the login form and navigate to dashboard"

# Ask Mode - Direct question/answer with AI assistance  
runix ai ask "What elements can I interact with on this screen?"

# Editor Mode - Learn from user actions
runix ai editor "user-workflow-session"

# Configuration check
runix ai config --check
```

### AI Driver in Feature Files

Use AI capabilities directly in your Gherkin scenarios:

```gherkin
Feature: AI-Enhanced Automation
  Scenario: Intelligent task completion
    # Ask AI for help
    When I ask "What are the available options on this page?"
    
    # Use AI agent mode for complex tasks
    And I use AI agent mode to "fill out the contact form with test data"
    
    # AI analysis and verification
    Then I analyze intent "verify the form submission was successful"
    And I generate answer for "What happened after submitting the form?"
```

### Available AI Steps

The AI driver currently provides 8 registered step patterns:

| Pattern | Status | Description | Example |
|---------|--------|-------------|---------|
| `I ask "(.*)"`  | ✅ **Working** | Ask a question to the AI | `I ask "What can you do?"` |
| `I use AI agent mode to "(.*)"` | 🚧 **Planned** | Complex autonomous tasks | `I use AI agent mode to "complete checkout"` |
| `I use AI editor mode "(.*)"` | 🚧 **Planned** | Learning mode | `I use AI editor mode "learn-workflow"` |
| `I analyze intent "(.*)"`  | 🚧 **Planned** | Intent analysis | `I analyze intent "verify success"` |
| `I generate answer for "(.*)"`| 🚧 **Planned** | Generate responses | `I generate answer for "what happened?"` |
| `I ask for help with "(.*)"`  | ✅ **Working** | Request assistance | `I ask for help with "navigation"` |
| `the operation should be successful` | ✅ **Working** | Verify success | `the operation should be successful` |
| `I set AI mode to "(.*)"`  | ✅ **Working** | Change AI mode | `I set AI mode to "ask"` |

### Configuration

Set up the AI driver with your OpenAI API key:

```bash
# Environment variables
export OPENAI_API_KEY="your-openai-api-key"
export AI_DEFAULT_MODEL="gpt-3.5-turbo"
export AI_TEMPERATURE="0.7"
export AI_MAX_TOKENS="1000"

# Check configuration
runix ai config --check
```

### Real OpenAI Integration

The AI driver makes actual API calls to OpenAI's GPT-3.5-turbo model:

- **✅ Live responses**: Real AI assistance, not mock data
- **✅ Context awareness**: Understands current automation state  
- **✅ Error handling**: Robust error handling for API failures
- **✅ Debugging support**: Comprehensive logging for troubleshooting
- **🚧 Multi-driver orchestration**: Intelligent coordination between drivers (coming soon)
- **🚧 Workflow generation**: Automatic feature file creation (coming soon)

For more advanced AI capabilities, see the [AI System Guide](./docs/AI_SYSTEM_GUIDE.md).

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

### Multi-Driver Workflows

Runix's automatic driver loading enables powerful multi-driver workflows:

```gherkin
Feature: Cross-Platform Automation
  Scenario: Complete Business Process Automation
    # System Driver: Data preparation
    Given I create file "customer-data.csv" with content "name,email\nJohn,john@example.com"
    
    # Web Driver: Form submission  
    When I open the browser at "https://myapp.com/customers"
    And I upload file "customer-data.csv" to "#file-upload"
    And I click the "Import" button
    
    # Vision Driver: Visual verification
    Then I take a screenshot "import-result.png"
    And I extract text from screenshot
    And I detect UI elements in screenshot    # AI Driver: Intelligent analysis and orchestration
    And I ask "Verify the customer import was successful"
    And I analyze intent "What does the import result show?"
    
    # System Driver: Cleanup
    And I delete file "customer-data.csv"
```

### Plugin Architecture

Easily extend Runix with custom drivers:

```bash
# Install a new driver plugin
runix plugin install my-custom-driver

# List available driver plugins
runix plugin list

# Create a new driver from template
runix create-driver --name="slack-driver" --template="communication"
```

### Enterprise Configuration

```json
{
  "autoLoadDrivers": true,
  "driverConfig": {
    "system-driver": {
      "securityLevel": "enterprise",
      "allowedPaths": ["/app/data", "/tmp"]
    },
    "web-driver": {
      "browserPool": 5,
      "distributedExecution": true,
      "headless": true
    },    "ai-driver": {
      "provider": "openai",
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "maxTokens": 1000
    }
  },
  "scaling": {
    "distributedDrivers": true,
    "workerNodes": ["node1.company.com", "node2.company.com"],
    "loadBalancing": "round-robin"
  },
  "reporting": {
    "outputDir": "./reports",
    "formats": ["json", "html", "junit"],
    "includeScreenshots": true,
    "realTimeReporting": true
  }
}
```
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

# 4. Try AI automation (requires OpenAI API key)
export OPENAI_API_KEY="your-api-key"
runix ai ask "What can you help me with?"

# 5. Enjoy both microservices and web automation examples!
```

This will demonstrate the full power of Runix with both microservices communication and real browser automation, complete with screenshots and detailed reporting.
