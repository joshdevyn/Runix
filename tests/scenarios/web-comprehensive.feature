Feature: Comprehensive Web Automation Tests
  As a Runix user
  I want to test all web automation capabilities
  So that I can automate complex web interactions

  @smoke @navigation
  Scenario: Navigation and Page Verification
    Given I open the browser at "https://example.com"
    Then the page title should be "Example Domain"
    And I should see "Example Domain"
    When I navigate to "https://httpbin.org"
    Then I should see "httpbin"

  @forms @input
  Scenario: Form Interactions and Input
    Given I navigate to "https://httpbin.org/forms/post"
    When I enter "John Doe" into the "custname" field
    And I enter "john@example.com" into the "custemail" field
    And I enter "Test message content" into "custtel"
    And I click the "submit" button
    Then I should see "form"

  @advanced @selection
  Scenario: Advanced Element Interactions
    Given I navigate to "https://the-internet.herokuapp.com/dropdown"
    When I select "Option 1" from "#dropdown"
    Then the "#dropdown" should be visible

  @verification @assertions
  Scenario: Comprehensive Verification Tests
    Given I navigate to "https://example.com"
    Then I should see "Example Domain"
    And I should not see "Non-existent text"
    And the page title should be "Example Domain"
    And the "h1" should be visible
    And the "h1" should be enabled

  @screenshots @documentation
  Scenario: Screenshot and Documentation
    Given I navigate to "https://example.com"
    When I take a screenshot named "example_homepage.png"
    And I take a screenshot
    Then I should see "Example Domain"

  @mouse @interactions
  Scenario: Mouse Interactions
    Given I navigate to "https://the-internet.herokuapp.com/hovers"
    When I hover over ".figure img"
    Then I should see "View profile"

  @windows @frames
  Scenario: Window and Frame Management
    Given I navigate to "https://the-internet.herokuapp.com/iframe"
    When I switch to frame "#mce_0_ifr"
    And I type "Test content" into "#tinymce"
    And I switch to default content
    Then I should see "An iFrame containing the TinyMCE WYSIWYG Editor"

  @javascript @dynamic
  Scenario: JavaScript Execution and Dynamic Content
    Given I navigate to "https://example.com"
    When I execute JavaScript "document.title = 'Modified Title'"
    Then the page title should be "Modified Title"

  @file @upload
  Scenario: File Upload Operations
    Given I navigate to "https://the-internet.herokuapp.com/upload"
    When I upload file "test-file.txt" to "#file-upload"
    And I click on "#file-submit"
    Then I should see "File Uploaded!"

  @performance @timing
  Scenario: Performance and Timing
    Given I navigate to "https://example.com"
    When I wait 2 seconds
    And I wait for "h1" to appear
    Then I should see "Example Domain"

  @responsive @scroll
  Scenario: Scroll and Responsive Testing
    Given I navigate to "https://example.com"
    When I scroll to "footer"
    Then the "h1" should be visible

  @keyboard @accessibility
  Scenario: Keyboard Navigation and Accessibility
    Given I navigate to "https://example.com"
    When I press tab key
    And I press enter key
    Then I should see "Example Domain"

  @data @extraction
  Scenario: Data Extraction and Validation
    Given I navigate to "https://httpbin.org/json"
    When I wait for "pre" to appear
    Then I should see "slideshow"
