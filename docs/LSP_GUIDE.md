# Runix Language Server Protocol (LSP) Guide

## Overview

Runix includes a comprehensive Language Server Protocol (LSP) implementation that provides intelligent code assistance for Gherkin feature files. The LSP server offers real-time validation, auto-completion, hover documentation, and more.

## Features

### ✅ Real-time Step Validation
- **AST-based parsing**: Uses Abstract Syntax Trees for accurate Gherkin parsing
- **Dynamic driver discovery**: Automatically loads step definitions from available drivers
- **Immediate feedback**: Shows undefined steps as you type
- **Error diagnostics**: Detailed error messages with suggestions

### 🎯 Smart Auto-completion
- **Context-aware suggestions**: Relevant step definitions based on Given/When/Then context
- **Parameter completion**: Smart completion for step parameters like {string}, {int}, etc.
- **Driver-specific steps**: Shows steps available from currently loaded drivers
- **Fuzzy matching**: Finds steps even with partial matches

### 💡 Hover Documentation
- **Step descriptions**: Detailed information about what each step does
- **Parameter details**: Information about required and optional parameters
- **Usage examples**: Real examples of how to use each step
- **Driver information**: Which driver provides each step

### 🔍 Advanced Parsing
- **Gherkin AST**: Full Abstract Syntax Tree parsing using @cucumber/gherkin
- **Error recovery**: Graceful handling of syntax errors
- **Location mapping**: Accurate line and column information for all elements
- **Multi-line support**: Proper handling of doc strings and data tables

## Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   LSP Server    │    │ Gherkin Parser  │    │ Driver Registry │
│                 │───▶│                 │───▶│                 │
│ - Completion    │    │ - AST Building  │    │ - Step Loading  │
│ - Validation    │    │ - Error Handling│    │ - Introspection │
│ - Hover         │    │ - Range Mapping │    │ - Discovery     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### LSP Server (`src/lsp/server.ts`)
- Handles LSP protocol communication
- Manages document lifecycle
- Provides completion, hover, and validation services
- Coordinates with other components

### Gherkin Parser (`src/lsp/gherkinParser.ts`)
- AST-based parsing using @cucumber/gherkin
- Converts Gherkin documents to LSP-friendly structures
- Provides accurate location and range information
- Handles parsing errors gracefully

### Driver Integration
- Automatically discovers step definitions from loaded drivers
- Updates step definitions when drivers are added/removed
- Provides real-time step validation based on available drivers

## Usage

### Starting the LSP Server

```bash
# Start standalone LSP server
npx runix lsp --port=2087

# Start with specific drivers
npx runix lsp --drivers=WebDriver,ApiDriver

# Start with debug logging
npx runix lsp --debug
```

### IDE Configuration

#### VS Code

Create `.vscode/settings.json`:

```json
{
  "runix.lsp.enabled": true,
  "runix.lsp.port": 2087,
  "runix.drivers.autoDiscover": true,
  "runix.validation.realTime": true,
  "runix.completion.triggerCharacters": [" ", "\n", "\t", "\""]
}
```

#### Vim/Neovim with nvim-lspconfig

```lua
local lspconfig = require('lspconfig')

lspconfig.runix = {
  default_config = {
    cmd = {'npx', 'runix', 'lsp'},
    filetypes = {'gherkin', 'feature'},
    root_dir = lspconfig.util.root_pattern('.git', 'package.json'),
    settings = {
      runix = {
        validation = { realTime = true },
        drivers = { autoDiscover = true }
      }
    }
  }
}

lspconfig.runix.setup{}
```

#### Emacs with lsp-mode

```elisp
(add-to-list 'lsp-language-id-configuration '(gherkin-mode . "gherkin"))

(lsp-register-client
 (make-lsp-client :new-connection (lsp-stdio-connection '("npx" "runix" "lsp"))
                  :major-modes '(gherkin-mode)
                  :server-id 'runix-lsp))
```

## Step Definition Format

The LSP server expects step definitions in the following format:

```typescript
interface StepDefinition {
  id: string;
  pattern: string;
  action: string;
  description?: string;
  parameters?: Array<{
    name: string;
    type: 'string' | 'int' | 'float' | 'word' | 'text';
    description?: string;
    required?: boolean;
    default?: any;
  }>;
  examples?: string[];
  tags?: string[];
  category?: string;
}
```

### Example Step Definition

```json
{
  "id": "navigate-to-url",
  "pattern": "I navigate to {string}",
  "action": "navigate",
  "description": "Navigate to a specific URL in the browser",
  "parameters": [
    {
      "name": "url",
      "type": "string",
      "description": "The URL to navigate to",
      "required": true
    }
  ],
  "examples": [
    "I navigate to \"https://example.com\"",
    "I navigate to \"https://google.com/search?q=test\""
  ],
  "tags": ["navigation", "web"],
  "category": "Navigation"
}
```

## Pattern Matching

The LSP server uses sophisticated pattern matching for step validation:

### Supported Parameter Types

- `{string}` - Matches quoted strings: `"hello world"`
- `{int}` - Matches integers: `42`, `-10`
- `{float}` - Matches floating point numbers: `3.14`, `-2.5`
- `{word}` - Matches single words: `username`, `button`
- `{text}` - Matches any text: `any text here`
- `{*}` - Matches anything: `.*`

### Pattern Examples

```gherkin
# Pattern: "I enter {string} into the {string} field"
Given I enter "admin" into the "username" field  ✅

# Pattern: "I wait {int} seconds"
When I wait 5 seconds  ✅

# Pattern: "the price should be {float}"
Then the price should be 19.99  ✅
```

## Error Handling

The LSP server provides comprehensive error handling:

### Parsing Errors

```gherkin
Feature: Invalid Feature
  Scenario: Test
    Given I have a step
    When I have another step with invalid syntax here
         ^~~~~ Parsing error: Unexpected token
    Then I should see an error
```

### Undefined Steps

```gherkin
Feature: Valid Feature
  Scenario: Test
    Given I navigate to "https://example.com"  ✅
    When I click the magic button             ⚠️ No matching step definition
    Then I should see the result              ✅
```

### Parameter Validation

```gherkin
Feature: Parameter Validation
  Scenario: Test
    Given I wait "not a number" seconds       ❌ Expected integer, got string
    When I enter 123 into the "field" field  ❌ Expected string in quotes
```

## Diagnostics

The LSP server provides detailed diagnostics:

### Severity Levels

- **Error**: Syntax errors, critical parsing issues
- **Warning**: Undefined steps, deprecated patterns
- **Information**: Suggestions, performance tips
- **Hint**: Code style recommendations

### Diagnostic Messages

```json
{
  "severity": "Warning",
  "range": {
    "start": {"line": 5, "character": 4},
    "end": {"line": 5, "character": 25}
  },
  "message": "No matching step definition found for: \"When I click the magic button\"",
  "source": "runix-lsp",
  "code": "undefined-step",
  "relatedInformation": [
    {
      "location": {...},
      "message": "Did you mean: \"When I click the {string} button\"?"
    }
  ]
}
```

## Performance

The LSP server is optimized for performance:

### Parsing Performance
- **Incremental parsing**: Only re-parses changed sections
- **AST caching**: Caches parsed ASTs for unchanged documents
- **Lazy loading**: Loads step definitions on demand

### Response Times
- **Completion**: < 50ms for typical files
- **Validation**: < 100ms for files under 1000 lines
- **Hover**: < 10ms for cached information

### Memory Usage
- **Efficient AST storage**: Optimized data structures
- **Document caching**: Smart caching with LRU eviction
- **Step definition indexing**: Fast lookup tables

## Troubleshooting

### Common Issues

#### LSP Server Not Starting

```bash
# Check if the server is accessible
npx runix lsp --test

# Start with verbose logging
npx runix lsp --debug --log-level=debug
```

#### No Step Completion

1. **Check driver discovery**:
   ```bash
   npx runix list-drivers
   ```

2. **Verify step definitions**:
   ```bash
   npx runix list-steps
   ```

3. **Check LSP logs**:
   Look for driver loading messages in LSP output

#### Slow Performance

1. **Check file size**: LSP is optimized for files < 1000 lines
2. **Disable real-time validation**: Set `realTime: false` in settings
3. **Limit driver discovery**: Specify specific drivers instead of auto-discovery

### Debug Mode

Enable debug mode for detailed logging:

```bash
npx runix lsp --debug --log-file=lsp-debug.log
```

Debug logs include:
- Driver discovery and loading
- Step definition registration
- Parsing performance metrics
- Request/response timing
- Error stack traces

## Development

### Adding LSP Features

1. **Extend the LSP server** (`src/lsp/server.ts`)
2. **Update the parser** if needed (`src/lsp/gherkinParser.ts`)
3. **Add tests** for new functionality
4. **Update documentation**

### Testing LSP Features

```bash
# Run LSP-specific tests
npm run test:lsp

# Test with real IDE integration
npm run test:lsp:integration

# Performance testing
npm run test:lsp:performance
```

### Contributing LSP Improvements

When contributing to LSP features:

1. **Follow LSP specification**: Ensure compliance with LSP 3.17
2. **Test with multiple editors**: VS Code, Vim, Emacs, etc.
3. **Performance first**: Keep response times under target thresholds
4. **Error handling**: Provide clear, actionable error messages
5. **Documentation**: Update both code and user documentation

## API Reference

### LSP Capabilities

```typescript
interface RunixLSPCapabilities {
  textDocumentSync: TextDocumentSyncKind.Incremental;
  completionProvider: {
    resolveProvider: false;
    triggerCharacters: [' ', '\n', '\t', '"'];
  };
  hoverProvider: true;
  definitionProvider: true; // Planned
  documentSymbolProvider: true; // Planned
  workspaceSymbolProvider: true; // Planned
  codeActionProvider: true; // Planned
}
```

### Configuration Options

```typescript
interface RunixLSPConfig {
  enabled: boolean;
  port?: number;
  validation: {
    realTime: boolean;
    severity: 'error' | 'warning' | 'info';
  };
  completion: {
    triggerCharacters: string[];
    maxItems: number;
  };
  drivers: {
    autoDiscover: boolean;
    specific?: string[];
    directory?: string;
  };
  performance: {
    maxFileSize: number;
    cacheSize: number;
    parseTimeout: number;
  };
}
```

## Future Enhancements

### Planned Features

- **Go to Definition**: Navigate to step definition sources
- **Document Symbols**: Outline view of features and scenarios
- **Workspace Symbols**: Search across all feature files
- **Code Actions**: Quick fixes for common issues
- **Refactoring**: Rename steps, extract scenarios
- **Semantic Highlighting**: Advanced syntax highlighting
- **Inlay Hints**: Parameter type hints

### Integration Improvements

- **VS Code Extension**: Dedicated extension with UI
- **Testing Integration**: Run scenarios from editor
- **Debugging Support**: Step-by-step debugging
- **Git Integration**: Diff support for feature files
- **CI/CD Integration**: Export validation results

---

For more information, see the [main README](../README.md) or the [API documentation](./API.md).