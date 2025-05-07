# Runix Web Driver Usage Guide

This guide explains how to use the Playwright-based web driver for browser automation with Runix.

## Installation

First, make sure you have the required dependencies:

```bash
# Install Playwright
npm install playwright
```

## Basic Usage

```bash
# Run a feature file using the Playwright web driver
runix run ./features/login.feature --driver=PlaywrightWebDriver
```

## Configuration Options

You can configure the web driver with various options:

```bash
# Configure browser type and headless mode
runix run ./features/login.feature --driver=PlaywrightWebDriver --driverConfig='{"browserType":"firefox","headless":false}'
```

Available configuration options:

| Option | Description | Default |
| ------ | ----------- | ------- |
| browserType | Browser to use: 'chromium', 'firefox', or 'webkit' | 'chromium' |
| headless | Run browser in headless mode | true |
| slowMo | Slow down operations by specified milliseconds | 0 |
| viewport | Browser viewport size | { width: 1280, height: 720 } |
| timeout | Default timeout for operations in milliseconds | 30000 |
| userAgent | Custom user agent string | (browser default) |
| launchArgs | Array of args to pass to browser launch | [] |

## Supported Actions

The PlaywrightWebDriver supports the following actions:

### Navigation

- **open**: Navigate to a URL
  ```gherkin
  Given I open the browser at "https://example.com"
  ```

- **reload**: Reload the current page
  ```gherkin
  When I reload the page
  ```

- **goBack**: Navigate back in history
  ```gherkin
  When I navigate back
  ```

- **goForward**: Navigate forward in history
  ```gherkin
  When I navigate forward
  ```

### Interactions

- **click**: Click an element
  ```gherkin
  When I click the "login" button
  When I click "#submit-button"
  ```

- **doubleClick**: Double-click an element
  ```gherkin
  When I double click on ".item"
  ```

- **rightClick**: Right-click an element
  ```gherkin
  When I right click on ".context-menu-item"
  ```

- **hover**: Hover over an element
  ```gherkin
  When I hover over ".dropdown"
  ```

- **enterText**: Enter text into a field
  ```gherkin
  When I enter "username" into the "username" field
  When I enter "password" into the "#password" field
  ```

- **clearText**: Clear text from a field
  ```gherkin
  When I clear text from "#search"
  ```

- **selectOption**: Select an option from a dropdown
  ```gherkin
  When I select "Option 1" from the "dropdown" field
  ```

### Waiting

- **waitForElement**: Wait for an element to appear
  ```gherkin
  When I wait for element ".notification"
  When I wait for element "#results" for "5000" ms
  ```

- **waitForNavigation**: Wait for navigation to complete
  ```gherkin
  When I wait for navigation to complete
  ```

### Assertions

- **assertVisible**: Assert an element is visible
  ```gherkin
  Then I should see "Welcome message"
  Then element ".error" should be visible
  ```

- **assertText**: Assert text content of an element
  ```gherkin
  Then element "#heading" should contain text "Dashboard"
  ```

- **assertTitle**: Assert page title
  ```gherkin
  Then page title should be "Login Page"
  ```

- **assertUrl**: Assert current URL
  ```gherkin
  Then URL should contain "dashboard"
  ```

### Browser State

- **screenshot**: Take a screenshot
  ```gherkin
  When I take a screenshot "login-page.png"
  ```

- **setCookie**: Set a browser cookie
  ```gherkin
  When I set cookie "{"name":"session","value":"123"}"
  ```

- **getCookies**: Get all browser cookies
  ```gherkin
  When I get all cookies
  ```

- **clearCookies**: Clear all browser cookies
  ```gherkin
  When I clear all cookies
  ```

### Advanced

- **executeJs**: Execute JavaScript in the page context
  ```gherkin
  When I execute JavaScript "document.querySelector('.hidden').style.display = 'block'"
  ```

## Example Feature File

```gherkin
Feature: User Authentication

  Scenario: Successful login
    Given I open the browser at "https://example.com/login"
    When I enter "admin" into the "#username" field
    And I enter "password123" into the "#password" field
    And I click the "#login-button"
    And I wait for element "#welcome-message"
    Then element "#welcome-message" should contain text "Welcome, admin"
    And I take a screenshot "successful-login.png"
```

## Running Tests with Different Browsers

```bash
# Run with Firefox
runix run ./features/login.feature --driver=PlaywrightWebDriver --driverConfig='{"browserType":"firefox"}'

# Run with WebKit (Safari)
runix run ./features/login.feature --driver=PlaywrightWebDriver --driverConfig='{"browserType":"webkit"}'
```

## Running Tests in UI Mode (Non-Headless)

```bash
runix run ./features/login.feature --driver=PlaywrightWebDriver --driverConfig='{"headless":false,"slowMo":50}'
```

The `slowMo` option slows down operations so you can see what's happening.
