# WebDriver Step Pattern Reference

This README explains where the step patterns come from, how they are defined, and why they must match exactly.

---

## 1. Source of step patterns

1. **driver.json**  
   Under the `"supportedSteps"` array you will find entries like:
   ```jsonc
   {
     "id": "verify-title",
     "pattern": "the page title should be {string}",
     "action": "verifyTitle",
     "description": "Verify exact page title",
     "examples": ["the page title should be \"Example Domain\""]
   }
   ```
   These Cucumber‐style expressions drive both driver introspection and LSP matching.

2. **LSP Integration**  
   The Runix Language Server automatically loads these patterns and provides:
   - **Auto-completion**: Step suggestions as you type
   - **Validation**: Real-time checking against available patterns  
   - **Hover Documentation**: Rich information when hovering over steps
   - **Error Highlighting**: Clear feedback for unmatched steps

---

## 2. How matching works

- The LSP server and test runner parse each Gherkin step and try to find a pattern whose expression matches.
- Cucumber‐style tokens:
  - `{string}`  matches a quoted string, e.g. `"Example Domain"`
  - `{int}`     matches an integer, e.g. `2`
  - `{word}`    matches a single word (no spaces)
  - `{text}`    matches any text content
  - `{float}`   matches decimal numbers

**Example**  
Step in feature:
```gherkin
Then the page title should be "Example Domain"
```
Pattern in `driver.json`:
```
the page title should be {string}
```
→ When the engine sees `the page title should be "Example Domain"`, it binds `{string}` → `Example Domain` and invokes the `verifyTitle` action.

---

## 3. IDE Integration

With the Runix Language Server running, you get:

- **Auto-completion**: Type "the page" and see suggestions for title-related steps
- **Real-time validation**: Invalid steps are highlighted immediately
- **Parameter hints**: Hover over `{string}` to see what parameter is expected
- **Rich documentation**: Hover over any step to see its description and examples

---

## 4. Common mismatch causes

- **Extra or missing words/punctuation**  
  `the page title should be` vs. `the page title should contain`
- **Wrong token type**  
  Using `{string}` vs. `{int}` vs. `{word}`
- **Omitted quotes**  
  The runner expects quotes around `{string}` parameters: `"value"` not `value`
- **Case sensitivity**  
  `Then` vs. `then` - use proper Gherkin keywords

---

## 5. Extending or fixing patterns

1. **Edit `driver.json`**  
   Add or adjust an entry under `"supportedSteps"` following the existing format:
   ```jsonc
   {
     "id": "wait-seconds",
     "pattern": "I wait {int} seconds",
     "action": "wait",
     "description": "Pauses execution for specified seconds",
     "examples": ["I wait 3 seconds"],
     "parameters": [
       {
         "name": "seconds",
         "type": "int",
         "description": "Number of seconds to wait",
         "required": true
       }
     ]
   }
   ```

2. **Restart the LSP server**  
   The updated patterns will be automatically loaded and available in your IDE.

3. **Test the pattern**  
   Write a test step in a `.feature` file and verify it gets validated correctly.

---

## 6. Available Step Patterns

The web driver currently supports patterns for:

- **Navigation**: Opening URLs, page navigation
- **Element Interaction**: Clicking, typing, form manipulation  
- **Verification**: Checking page titles, element visibility, text content
- **Waiting**: Explicit waits for elements or conditions
- **Screenshots**: Capturing page screenshots

See the `supportedSteps` array in `driver.json` for the complete list with examples.

---

By keeping your feature steps and the driver's `"pattern"` strings in sync (including spacing, quotes, and token placeholders), you ensure that all steps—such as:
```gherkin
Then the page title should be "Example Domain"
```  
—match exactly and execute the expected action with full IDE support.