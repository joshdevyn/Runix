Feature: Comprehensive Web Automation Demo
  This feature demonstrates comprehensive web automation capabilities
  including navigation, form interaction, and validation

  Scenario: Basic website navigation and interaction
    Given open the browser at "https://example.com"
    When take a screenshot "01-homepage.png"
    Then element "h1" should be visible
    And element "h1" should contain text "Example Domain"

  Scenario: Form interaction demo
    Given open the browser at "https://httpbin.org/forms/post"
    When take a screenshot "02-form-page.png"
    And take a screenshot "03-form-filled.png"
    Then element "input[name='email']" should be visible
    And element "input[name='name']" should be visible

  Scenario: Dynamic content interaction
    Given open the browser at "https://httpbin.org/delay/1"
    When wait for element "body"
    And take a screenshot "04-delayed-content.png"
    Then element "body" should be visible
