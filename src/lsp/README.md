# Runix Language Server

The Runix Language Server provides intelligent code assistance for Gherkin feature files in your IDE.

## Features

- **Step Validation**: Real-time validation of Gherkin steps against available driver capabilities
- **Auto-completion**: IntelliSense for step definitions with parameter hints
- **Hover Documentation**: Rich documentation when hovering over steps
- **Error Highlighting**: Clear error messages for invalid or unmatched steps
- **Go-to-Definition**: Navigate to step implementations (coming soon)

## Architecture

The Language Server follows the Language Server Protocol (LSP) specification and consists of:

- **`server.ts`**: Main LSP server implementation
- **`gherkinParser.ts`**: Gherkin AST parser using @cucumber/gherkin
- **Driver Integration**: Loads step definitions from registered drivers

## How It Works

1. **Driver Discovery**: The LSP server discovers and loads all available drivers
2. **Step Registry**: Extracts step definitions from each driver's configuration
3. **Gherkin Parsing**: Parses `.feature` files into an Abstract Syntax Tree (AST)
4. **Validation**: Matches steps against available driver patterns
5. **IDE Integration**: Provides diagnostics, completion, and hover information

## Supported IDEs

The Runix Language Server can be integrated with any editor that supports LSP:

- Visual Studio Code
- Vim/Neovim (with LSP plugins)
- Emacs (with lsp-mode)
- Sublime Text (with LSP plugin)
- JetBrains IDEs (with LSP plugin)

## Configuration

### Visual Studio Code

Create a `.vscode/settings.json` file in your project:

```json
{
  "files.associations": {
    "*.feature": "gherkin"
  },
  "runix.lsp.enabled": true,
  "runix.lsp.serverPath": "./node_modules/.bin/runix-lsp"
}
```

### Manual LSP Client Configuration

For other editors, configure your LSP client to:

- **Command**: `node src/lsp/server.js`
- **File Types**: `*.feature`
- **Language ID**: `gherkin`

## Step Pattern Matching

The LSP server uses Cucumber Expression syntax for matching steps:

- `{string}` - Matches quoted strings: `"example"`
- `{int}` - Matches integers: `42`
- `{float}` - Matches decimal numbers: `3.14`
- `{word}` - Matches single words: `example`
- `{text}` - Matches any text: `anything here`
- `{*}` - Matches everything: `.*`

## Example

Given this step definition in a driver:

```json
{
  "pattern": "I enter {string} into the {string} field",
  "description": "Enter text into a form field",
  "parameters": [
    {
      "name": "text",
      "type": "string",
      "description": "The text to enter"
    },
    {
      "name": "field",
      "type": "string", 
      "description": "The field selector"
    }
  ]
}
```

The LSP will provide:

- **Validation**: `When I enter "admin" into the "#username" field` ✅
- **Error**: `When I enter admin into the username field` ❌ (missing quotes)
- **Completion**: Suggests the pattern when typing `When I enter`
- **Hover**: Shows parameter documentation when hovering over the step

## Driver Integration

The LSP server automatically loads step definitions from:

1. **Driver Configuration**: `supportedSteps` array in `driver.json`
2. **Runtime Introspection**: Calls the `introspect/steps` endpoint if supported
3. **Driver Registry**: Integrates with the Runix driver registry

## Error Reporting

The LSP provides several types of diagnostics:

- **Parse Errors**: Syntax errors in Gherkin files
- **Unmatched Steps**: Steps that don't match any driver pattern
- **Parameter Errors**: Invalid parameter types or formats
- **Driver Warnings**: Issues with driver availability

## Development

To work on the Language Server:

```bash
# Install dependencies
npm install

# Build the LSP server
npm run build

# Run tests
npm run test:lsp

# Start in development mode
npm run dev:lsp
```

## Contributing

The Language Server is part of the Runix project. See the main [Contributing Guide](../../README.md#contributing) for details.

## Future Enhancements

- **Snippet Support**: Pre-defined step templates
- **Refactoring**: Rename steps across files
- **Code Actions**: Quick fixes for common issues
- **Semantic Highlighting**: Better syntax highlighting
- **Workspace Symbols**: Navigate to scenarios and features