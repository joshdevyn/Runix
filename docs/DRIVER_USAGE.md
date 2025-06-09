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

### AI Driver

OpenAI-powered intelligent automation:

**Capabilities:**
- Natural language question answering
- Task analysis and guidance
- Agent mode for autonomous completion
- Context-aware assistance

**Configuration Example:**
```json
{
  "provider": "openai",
  "model": "gpt-3.5-turbo",
  "temperature": 0.7,
  "maxTokens": 1000
}
```

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
