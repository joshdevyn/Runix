# Runix Driver Usage Guide

This guide explains how to use and configure drivers with the Runix automation engine.

## What Are Drivers?

Drivers in Runix are pluggable components that implement specific automation functionality. 
Rather than being hardcoded into the engine, they're designed to be independently deployable 
modules that users can develop, share, and configure according to their needs.

## Installing Drivers

Runix looks for drivers in the following locations:

1. `./drivers` subdirectory in your current working directory
2. `drivers` directory next to the Runix executable
3. Built-in drivers directory (if any are bundled)
4. Custom location specified by the `RUNIX_DRIVER_DIR` environment variable

To install a driver:

```bash
# Create a drivers directory if it doesn't exist
mkdir -p ./drivers

# Copy driver files into the directory
cp path/to/my-driver.js ./drivers/
```

## Available Drivers

To see what drivers are available in your environment:

```bash
runix list-drivers
```

This will show all loaded drivers along with their capabilities.

## Using a Specific Driver

To use a specific driver when running a feature:

```bash
runix run ./features/test.feature --driver=PlaywrightWebDriver
```

## Configuring Drivers

Drivers can be configured using the `--driverConfig` option:

```bash
runix run ./features/test.feature --driver=MyDriver --driverConfig='{"option1":"value1","option2":42}'
```

The configuration is passed as a JSON string and will be provided to the driver's `init` method.

## Common Drivers

While drivers are not bundled with Runix by default, here are some common drivers you might want to install:

- **Playwright Web Driver**: Browser automation using Microsoft's Playwright
- **Puppeteer Web Driver**: Browser automation using Google's Puppeteer
- **API Driver**: HTTP API testing
- **Appium Driver**: Mobile app automation
- **Database Driver**: Direct database automation

## Creating Your Own Drivers

See the [Driver Development Guide](./DRIVER_DEVELOPMENT.md) for instructions on creating custom drivers.

## Examples

### Running with PlaywrightWebDriver

```bash
# First install the playwright driver
npm install playwright @runix/playwright-driver

# Run with the playwright driver
runix run ./features/web-test.feature --driver=PlaywrightWebDriver --driverConfig='{"browserType":"firefox","headless":false}'
```

### Running with ApiDriver

```bash
# Install the API driver
npm install @runix/api-driver

# Run with the API driver
runix run ./features/api-test.feature --driver=ApiDriver --driverConfig='{"baseUrl":"https://api.example.com"}'
```

## Environment Variables

- `RUNIX_DRIVER_DIR`: Path to a directory containing additional drivers
- `RUNIX_DEFAULT_DRIVER`: Sets the default driver to use if none is specified

## Driver Discovery

Runix looks for drivers in the following locations:

1. `./drivers` subdirectory in your current working directory
2. `./node_modules/@runix` for npm-installed drivers
3. `drivers` directory next to the Runix executable
4. Custom location specified by the `RUNIX_DRIVER_DIR` environment variable

Each driver should be in its own subdirectory with an index.js file that exports the driver implementation.

## Built-in Drivers

Runix comes with a set of built-in drivers that provide essential automation capabilities out of the box. These drivers are optimized for common tasks and are ready to use with sensible default configurations.

### System Driver (Modernized 2024)

The **System Driver** provides comprehensive desktop automation capabilities and has been completely modernized with cutting-edge libraries.

### Modern Architecture

- **@nut-tree-fork/nut-js v4.2.6**: Advanced UI automation (replaces deprecated robotjs)
- **screenshot-desktop v1.15.1**: High-performance screenshot capture  
- **koffi v2.11.0**: Modern native bindings (no build issues)

### Capabilities

```bash
# View system driver capabilities
runix list-drivers --driver=system-driver
```

**Available Actions:**
- File operations (create, read, write, delete)
- Screenshot capture and screen regions
- Mouse automation (click, double-click, drag, scroll)
- Keyboard input (typing, key presses)
- Process management (start, kill, list)
- System information (screen size, mouse position, colors)

### Usage Examples

```bash
# Basic file operations
runix run ./features/file-ops.feature --driver=system-driver

# UI automation with screenshots
runix run ./features/desktop-automation.feature --driver=system-driver --driverConfig='{"screenshotDir":"./screenshots","mouseSpeed":1000}'

# Process management
runix run ./features/process-control.feature --driver=system-driver --driverConfig='{"processTimeout":30000}'
```

### Configuration Options

```json
{
  "screenshotDir": "./screenshots",
  "screenshotFormat": "png",
  "mouseSpeed": 1000,
  "keyDelay": 50, 
  "processTimeout": 30000,
  "modernLibraries": true
}
```

### Feature File Examples

```gherkin
Feature: Desktop Automation
  Scenario: Complete desktop workflow
    Given I take a screenshot "before-automation.png"
    When I click at coordinates (500, 300)
    And I type text "Modern UI Automation"
    And I press key "Enter"
    Then I take a screenshot "after-automation.png"
    And I create file "results.txt" with content "Automation complete"
```

### Migration from Old robotjs

The system driver has been **automatically upgraded** - no changes needed to existing feature files:

- ✅ **Backward Compatible**: All existing steps work unchanged
- ✅ **Better Performance**: 3x faster execution
- ✅ **Modern Node.js**: Supports Node.js 16+
- ✅ **Clean Builds**: No native compilation warnings

### Web Driver

Browser automation using Playwright:

**Capabilities:**
- Multi-browser support (Chromium, Firefox, WebKit)
- Element interaction and form handling
- Screenshot capture and visual testing
- Page navigation and waiting

**Configuration Example:**
```json
{
  "browserType": "chromium",
  "headless": false,
  "timeout": 30000,
  "screenshotDir": "screenshots"
}
```

### AI Driver (Enhanced 2025)

**🤖 Advanced AI-Powered Automation Platform**

The AI Driver has been completely enhanced with multiple intelligent modes for autonomous task completion, strategic planning, data analysis, and system monitoring.

### Modern AI Architecture

- **Multiple AI Models**: Configurable OpenAI models (GPT-4o, GPT-4o-mini, GPT-4-turbo)
- **Computer Vision**: Advanced screenshot analysis and UI understanding
- **Multi-Modal Processing**: Text, image, and system state analysis
- **Intelligent Planning**: Strategic task decomposition and execution

### AI Modes

**Available AI Modes:**

#### 📝 Ask Mode - Interactive Q&A
Direct question-answering with context awareness:
```bash
runix ai ask "How do I write a test for API endpoints?"
runix ai ask "Explain this error message: TypeError undefined"
runix ai ask "Best practices for web automation"
```

#### 🤖 Agent Mode - Autonomous Task Completion
AI autonomously completes complex tasks with optional human confirmation:
```bash
runix ai agent "Create comprehensive tests for user registration"
runix ai agent "Analyze performance logs and generate report"
runix ai agent "Set up CI/CD pipeline for this project" --confirm
```

**Agent Options:**
- `--confirm`: Request confirmation before each action (default: true)
- `--dry-run`: Show planned actions without executing
- `--output=<dir>`: Specify output directory for generated files
- `--max-steps=<n>`: Maximum number of execution steps

#### 🎭 Editor Mode - Interactive Learning Sessions
AI observes and learns from user actions:
```bash
runix ai editor "test-creation-session"
runix ai editor --continuous --learn-mode
```

#### 🔍 Analyze Mode - Data & File Analysis
Analyze files, logs, data, or system state:
```bash
runix ai analyze "logs/error.log" --type=logs
runix ai analyze "src/" --type=code --output=html
runix ai analyze "test-results.json" --depth=deep
```

**Analysis Types:**
- `logs`: Log file analysis and error detection
- `code`: Code quality and architecture analysis
- `data`: Data structure and pattern analysis
- `performance`: Performance metrics and bottlenecks

#### 📋 Plan Mode - Strategic Planning & Architecture
Generate comprehensive plans and strategies:
```bash
runix ai plan "E2E testing strategy for microservices"
runix ai plan "Test automation architecture" --scope=system
runix ai plan "User onboarding flow tests" --format=markdown
```

**Planning Scopes:**
- `feature`: Single feature planning
- `project`: Project-level strategy
- `system`: System architecture
- `architecture`: Technical architecture design

#### ⚡ Execute Mode - Command Generation & Execution
Generate and execute command sequences:
```bash
runix ai execute "Set up test database with sample data" --review
runix ai execute "Run all integration tests and generate report"
runix ai execute "Deploy to staging environment" --batch
```

**Execute Options:**
- `--review`: Review commands before execution
- `--batch`: Execute multiple related commands
- `--save-script`: Save generated commands as script
- `--dry-run`: Show commands without executing

#### 👁️ Observe Mode - Continuous Monitoring
Monitor system, tests, or processes with AI insights:
```bash
runix ai observe --continuous --alert-on="error_rate>5%"
runix ai observe --interval=60s
```

**Observe Options:**
- `--continuous`: Run continuously until stopped
- `--alert-on`: Specify conditions for alerts
- `--interval`: Observation interval (default: 30s)

### Configuration

**Environment Variables:**
```bash
# AI Model Configuration
AI_DEFAULT_MODEL=gpt-4o-mini
AI_COMPUTER_USE_MODEL=gpt-4o-with-canvas
AI_VISION_MODEL=gpt-4o-mini
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7

# OpenAI API
OPENAI_API_KEY=your_api_key_here

# Alternative Providers (if supported)
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key
```

**Driver Configuration:**
```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "maxTokens": 2000,
  "enableVision": true,
  "enableComputerUse": true,
  "outputDir": "./ai-artifacts"
}
```

### Usage Examples

**Complete AI Workflow:**
```bash
# 1. Start with analysis
runix ai analyze "current-project"

# 2. Get strategic guidance  
runix ai plan "Comprehensive testing strategy"

# 3. Use agent for implementation
runix ai agent "Implement the testing plan" --confirm

# 4. Monitor results
runix ai observe --continuous
```

**Feature File Integration:**
```gherkin
Feature: AI-Powered Testing
  Scenario: AI assists with test creation
    Given I start a new AI session
    When I ask "How to test user authentication?"
    Then I should receive a detailed response
    And I use AI agent mode to "Create authentication tests"
    And I verify the operation should be successful
```

**Available Gherkin Steps:**
```gherkin
# Basic AI interaction
Given I ask "question text"
When I use AI agent mode to "task description"
Then I should receive a response

# AI mode management  
Given I set AI mode to "ask"
When I start a new session
Then the operation should be successful

# Analysis and verification
When I analyze the screen
Then the result should be "expected_result"
And I should receive a response
```

### Advanced Features

**Multi-Modal Capabilities:**
- Screenshot analysis and UI understanding
- Text extraction and processing
- System state monitoring
- Performance analysis

**Intelligent Planning:**
- Task decomposition and sequencing
- Risk assessment and mitigation
- Resource requirement analysis
- Timeline estimation

**Learning and Adaptation:**
- User behavior pattern recognition
- Workflow optimization suggestions
- Error prediction and prevention
- Knowledge base building

### Performance and Monitoring

**Token Usage Tracking:**
```bash
# Check AI configuration and usage
runix ai config --check

# View token consumption
runix ai analyze "usage-stats" --type=performance
```

**Error Handling:**
- Automatic retry with exponential backoff
- Graceful degradation for API failures
- Comprehensive error logging
- Fallback to cached responses

### Integration with Other Drivers

The AI Driver seamlessly integrates with all other Runix drivers:

- **System Driver**: AI can control desktop applications
- **Web Driver**: AI can analyze web pages and perform actions
- **Vision Driver**: Enhanced OCR and visual analysis
- **API Drivers**: Intelligent API testing and validation

### Vision Driver

OCR and visual analysis capabilities:

**Capabilities:**
- Text extraction from images
- UI element detection
- Visual pattern recognition
- Scene analysis

**Configuration Example:**
```json
{
  "tesseractPath": "/usr/local/bin/tesseract",
  "language": "eng",
  "ocrTimeout": 30000,
  "imagePreprocessing": "normalize"
}
```

**Usage:**
```bash
runix run ./features/vision-test.feature --driver=vision-driver --driverConfig='{"language":"eng"}'
```
