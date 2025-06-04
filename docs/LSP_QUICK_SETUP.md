# Runix LSP Quick Setup Guide

## What is LSP?

The Language Server Protocol (LSP) provides intelligent code assistance for Gherkin feature files, including:
- ✅ **Real-time step validation** - See immediately if steps are defined
- 💡 **Auto-completion** - Smart suggestions for available steps
- 📖 **Hover documentation** - Detailed step information on hover
- 🎯 **Context-aware help** - Suggestions based on your loaded drivers

## Quick Setup (2 minutes)

### 1. Start the LSP Server

```bash
# Make sure Runix is built
npm run build

# Start the LSP server (runs on port 2087 by default)
npx runix lsp
```

You should see:
```
Runix language server initializing...
Loaded X step definitions from Y drivers
LSP server listening on port 2087
```

### 2. Configure Your Editor

#### VS Code (Recommended)
1. Install the "Language Server Protocol" or generic LSP extension
2. Add to your `settings.json`:

```json
{
  "languageServerExample.trace.server": "verbose",
  "runix.lsp.enabled": true
}
```

#### VS Code Manual Configuration
Add to `settings.json`:

```json
{
  "languageServer": {
    "runix": {
      "command": "npx",
      "args": ["runix", "lsp"],
      "filetypes": ["gherkin"]
    }
  }
}
```

#### Other Editors
- **Vim/Neovim**: Use with `nvim-lspconfig` (see [LSP_GUIDE.md](./docs/LSP_GUIDE.md))
- **Emacs**: Use with `lsp-mode`
- **Sublime Text**: Use with LSP package

### 3. Test It Out

1. **Create a test file**: `test.feature`
2. **Start typing**:

```gherkin
Feature: Test Feature
  Scenario: Test Scenario
    Given I 
```

3. **See the magic**:
   - Auto-completion suggestions appear
   - Real-time validation of steps
   - Hover over steps for documentation

## Troubleshooting

### LSP Server Not Starting
```bash
# Check if node modules are installed
npm install

# Build the project
npm run build

# Test the LSP server
npx runix lsp --test
```

### No Auto-completion
```bash
# Check if drivers are loaded
npx runix list-drivers

# Start LSP with debug output
npx runix lsp --debug
```

### Editor Not Connecting
1. **Check port**: LSP server runs on port 2087 by default
2. **Check firewall**: Ensure port is not blocked
3. **Check editor config**: Verify LSP client configuration

## Next Steps

- **Full Guide**: See [docs/LSP_GUIDE.md](./docs/LSP_GUIDE.md) for comprehensive documentation
- **IDE Setup**: Detailed setup for specific editors
- **Advanced Features**: Hover documentation, go-to-definition, and more
- **Driver Integration**: How to add step definitions to your custom drivers

## Common Use Cases

### Web Testing
```gherkin
Feature: Web Testing
  Scenario: Login Test
    Given I navigate to "https://example.com"    # ✅ Auto-completes
    When I enter "admin" into "#username"        # ✅ Parameter validation
    Then I should see element "#welcome"         # ✅ Hover for documentation
```

### API Testing
```gherkin
Feature: API Testing
  Scenario: GET Request
    Given I have an API endpoint "https://api.example.com"
    When I send a GET request to "/users"        # ✅ Step suggestions
    Then the response status should be 200       # ✅ Real-time validation
```

Enjoy intelligent Gherkin editing with Runix LSP! 🚀