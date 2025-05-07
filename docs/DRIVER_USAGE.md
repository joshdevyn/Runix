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
