Feature: Web Automation Tests
  In order to validate web interactions
  As a Runix user
  I want to test browser automation capabilities

  @demo
  Scenario: Basic web navigation with visible browser
    Given I open the browser at "https://example.com"
    When I navigate to "https://httpbin.org"
    Then I should see "httpbin"

  @demo @forms
  Scenario: Form interaction with visible browser
    Given I open the browser at "https://httpbin.org/forms/post"
    And I click the "submit" button
    Then I should see "form"

  @demo @screenshots
  Scenario: Screenshot test with visible browser
    Given I open the browser at "https://example.com"
    When I take a screenshot
    Then I should see "Example Domain"

  @demo @popular-sites @showcase
  Scenario: Popular sites demonstration - Watch the automation!
    Given I open the browser at "https://google.com"
    When I navigate to "https://github.com"
    Then I should see "GitHub"
