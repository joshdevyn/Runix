Feature: Advanced Web Automation Features
  As a Runix user
  I want to test all advanced web automation capabilities
  Including iframes, shadow DOM, alerts, file handling, and complex interactions

  @shadow-dom @advanced
  Scenario: Shadow DOM Interactions
    Given I navigate to "https://the-internet.herokuapp.com/shadowdom"
    When I find element "span" in shadow root of "#content ul li:first-child"
    And I click "span" in shadow root of "#content ul li:first-child"
    Then I should see "My Button"

  @alerts @dialogs
  Scenario: Alert and Dialog Handling
    Given I navigate to "https://the-internet.herokuapp.com/javascript_alerts"
    When I click "button[onclick='jsAlert()']"
    And I accept the alert
    Then I should see "You successfully clicked an alert"
    When I click "button[onclick='jsConfirm()']"
    And I dismiss the alert
    Then I should see "You clicked: Cancel"
    When I click "button[onclick='jsPrompt()']"
    And I enter "Test Input" in alert prompt
    Then I should see "You entered: Test Input"

  @file-upload @file-handling
  Scenario: Advanced File Operations
    Given I navigate to "https://the-internet.herokuapp.com/upload"
    When I create a test file "test-upload.txt" with content "This is a test file for upload"
    And I upload file "test-upload.txt" to "#file-upload"
    And I click "#file-submit"
    Then I should see "File Uploaded!"
    And I should see "test-upload.txt"

  @multiple-files @bulk-upload
  Scenario: Multiple File Upload
    Given I navigate to "https://the-internet.herokuapp.com/upload"
    When I create test files "file1.txt,file2.txt,file3.txt" with content "Test content"
    And I upload multiple files "file1.txt,file2.txt,file3.txt" to "#file-upload"
    And I click "#file-submit"
    Then I should see "File Uploaded!"

  @drag-drop @mouse-interactions
  Scenario: Advanced Mouse Interactions
    Given I navigate to "https://the-internet.herokuapp.com/drag_and_drop"
    When I drag "#column-a" to "#column-b"
    Then I should see "B" in "#column-a header"
    And I should see "A" in "#column-b header"

  @context-menu @right-click
  Scenario: Context Menu and Right Click
    Given I navigate to "https://the-internet.herokuapp.com/context_menu"
    When I right click on "#hot-spot"
    And I accept the alert
    Then I should see "You selected a context menu"

  @hovers @mouse-over
  Scenario: Hover Effects and Mouse Over
    Given I navigate to "https://the-internet.herokuapp.com/hovers"
    When I hover over ".figure:first-child img"
    Then I should see "name: user1"
    When I hover over ".figure:nth-child(2) img"
    Then I should see "name: user2"
    When I hover over ".figure:nth-child(3) img"
    Then I should see "name: user3"

  @frames @iframe-navigation
  Scenario: Complex Frame Navigation
    Given I navigate to "https://the-internet.herokuapp.com/nested_frames"
    When I switch to frame "frame[name='frame-top']"
    And I switch to frame "frame[name='frame-left']"
    Then I should see "LEFT"
    When I switch to parent frame
    And I switch to frame "frame[name='frame-middle']"
    Then I should see "MIDDLE"
    When I switch to main content
    And I switch to frame "frame[name='frame-bottom']"
    Then I should see "BOTTOM"

  @dynamic-content @ajax
  Scenario: Dynamic Content and AJAX
    Given I navigate to "https://the-internet.herokuapp.com/dynamic_content"
    When I click "a[href='#']"
    And I wait for "div.large-10" to appear
    Then the "div.large-10" should be visible
    And I should see dynamic content

  @infinite-scroll @dynamic-loading
  Scenario: Infinite Scroll and Dynamic Loading
    Given I navigate to "https://the-internet.herokuapp.com/infinite_scroll"
    When I scroll to bottom of page
    And I wait 3 seconds
    And I scroll to bottom of page
    Then I should see multiple paragraphs

  @tables @data-extraction
  Scenario: Table Data Extraction and Sorting
    Given I navigate to "https://the-internet.herokuapp.com/tables"
    When I click "table#table1 thead tr th:nth-child(1)"
    Then the table should be sorted by last name
    When I get text from "table#table1 tbody tr:first-child td:first-child"
    Then I should extract the first cell data

  @checkboxes @form-controls
  Scenario: Advanced Form Controls
    Given I navigate to "https://the-internet.herokuapp.com/checkboxes"
    When I check the "#checkboxes input:first-child" checkbox
    And I uncheck the "#checkboxes input:nth-child(2)" checkbox
    Then the "#checkboxes input:first-child" should be selected
    And the "#checkboxes input:nth-child(2)" should not be selected

  @dropdown @selection-advanced
  Scenario: Advanced Dropdown Selection
    Given I navigate to "https://the-internet.herokuapp.com/dropdown"
    When I select option by value "1" from "#dropdown"
    Then the "#dropdown" should have attribute "value" with value "1"
    When I select option by index 2 from "#dropdown"
    Then I should see "Option 2" in "#dropdown"

  @key-presses @keyboard-navigation
  Scenario: Advanced Keyboard Navigation
    Given I navigate to "https://the-internet.herokuapp.com/key_presses"
    When I press tab key in "#target"
    And I press enter key in "#target"
    And I press Ctrl+a
    Then I should see "You entered:"

  @cookies @session-management
  Scenario: Cookie and Session Management
    Given I navigate to "https://httpbin.org/cookies"
    When I add cookie "test_cookie" with value "test_value"
    And I navigate to "https://httpbin.org/cookies"
    Then I should see "test_cookie"
    When I delete cookie "test_cookie"
    And I refresh the page
    Then I should not see "test_cookie"

  @window-management @tabs
  Scenario: Advanced Window and Tab Management
    Given I navigate to "https://the-internet.herokuapp.com/windows"
    When I maximize window
    And I set window size to 1200x800
    And I click "a[href='/windows/new']"
    And I switch to new window
    Then I should see "New Window"
    When I close current window
    And I switch to window "original"
    Then I should see "Opening a new window"

  @javascript-execution @dom-manipulation
  Scenario: JavaScript Execution and DOM Manipulation
    Given I navigate to "https://example.com"
    When I execute JavaScript "document.body.style.backgroundColor = 'lightblue'"
    And I execute JavaScript "document.querySelector('h1').style.color = 'red'"
    Then the "body" should have CSS property "background-color" with value "lightblue"
    And the "h1" should have CSS property "color" with value "red"

  @performance @timing-advanced
  Scenario: Advanced Performance and Timing
    Given I navigate to "https://the-internet.herokuapp.com/dynamic_loading/1"
    When I click "#start button"
    And I wait for "#loading" to disappear
    And I wait for "#finish" to appear
    Then I should see "Hello World!"
    And the "#finish" should be visible

  @responsive @viewport
  Scenario: Responsive Design Testing
    Given I navigate to "https://example.com"
    When I set window size to 320x568
    And I take a screenshot named "mobile_view.png"
    And I set window size to 768x1024
    And I take a screenshot named "tablet_view.png"
    And I set window size to 1920x1080
    And I take a screenshot named "desktop_view.png"
    Then I should have screenshots for different viewports

  @accessibility @aria
  Scenario: Accessibility and ARIA Testing
    Given I navigate to "https://the-internet.herokuapp.com/login"
    When I get attribute "aria-label" from "#username"
    And I verify the "#username" should have attribute "type" with value "text"
    And I verify the "#password" should have attribute "type" with value "password"
    Then the form should be accessible

  @error-handling @edge-cases
  Scenario: Error Handling and Edge Cases
    Given I navigate to "https://the-internet.herokuapp.com/status_codes"
    When I click "a[href='status_codes/404']"
    Then I should see "404"
    When I go back in browser history
    And I click "a[href='status_codes/500']"
    Then I should see "500"

  @security @basic-auth
  Scenario: Security and Authentication
    Given I navigate to "https://the-internet.herokuapp.com/basic_auth"
    When I handle basic authentication with username "admin" and password "admin"
    Then I should see "Congratulations! You must have the proper credentials."

  @geolocation @location-services
  Scenario: Geolocation and Location Services
    Given I navigate to "https://the-internet.herokuapp.com/geolocation"
    When I click "button[onclick='getLocation()']"
    And I accept the alert
    Then I should see latitude and longitude coordinates
