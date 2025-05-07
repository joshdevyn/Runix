# Using Task with Runix

Runix uses [Task](https://taskfile.dev/) (go-task) as its task runner. This document explains how to use Task to build, test, and run Runix.

## Installation

First, make sure you have Task installed:

### Windows (with Chocolatey)
```bash
choco install go-task
```

### macOS (with Homebrew)
```bash
brew install go-task
```

### Linux
```bash
sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin
```

## Available Tasks

To see all available tasks:
```bash
task
```
or
```bash
task -l
```

## Common Tasks

### Building

```bash
# Build the project
task build

# Clean build artifacts
task clean

# Bundle into executables
task bundle
```

### Testing

```bash
# Run all tests
task test

# Run specific test types
task test:unit
task test:integration
task test:e2e

# Run tests with coverage
task test:coverage
```

### Running

```bash
# Run a specific feature file
task run -- scenarios/example.feature

# Run the example feature
task run:example

# Run the example driver feature
task run:driver-example
```

### Driver Development

```bash
# Create a new driver
task create-driver -- my-new-driver

# Test a driver
task test-driver -- ./drivers/my-driver

# Complete driver development workflow (create, install deps, test)
task driver:dev -- my-new-driver

# List all available drivers
task list-drivers
```

### CI/CD

```bash
# Run CI tasks (clean, build, test, bundle)
task ci
```

## Passing Arguments

To pass arguments to a task, use `--` followed by the arguments:

```bash
task run -- scenarios/my-feature.feature --driver=WebDriver

task test-driver -- ./drivers/my-driver --pattern="action tests"
```

## Task Dependencies

Some tasks automatically run other tasks as dependencies. For example:
- `bundle` will run `build` first
- `ci` will run `clean`, `build`, `test:coverage` and `bundle` in sequence

## Working with Task in IDEs

Most IDEs with terminal support can run Task commands directly. For Visual Studio Code, you can also install the "Task Runner" extension for better integration.
