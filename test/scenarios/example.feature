Feature: Sample login automation

  Scenario: User logs in
    Given I open the browser at "https://example.com"
    When I enter "username" into the "username" field
    And I enter "password" into the "password" field
    And I click the "login" button
    Then I should see "Welcome"
