Feature: Sample login automation

  Scenario: User logs in
    Given I open the browser at "https://example.com"
    When I enter "username" into the "username" field
    And I enter "password" into the "password" field
    And I click the "login" button
    Then I should see "Welcome"

Feature: Example Test Scenarios
  As a Runix user
  I want to see example scenarios
  So that I can understand how to write my own tests

  @example @basic
  Scenario: Simple driver test
    Given echo the message "Hello from example scenario"
    When add 10 and 5
    Then echo the message "Math operation complete"

  @example @timing
  Scenario: Timing operations
    Given wait for 100 milliseconds
    When echo the message "Quick wait complete"
    And wait for 200 milliseconds
    Then echo the message "All timing tests passed"
