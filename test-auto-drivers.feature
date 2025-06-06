Feature: Test Automatic Driver Loading
  Test that the engine can automatically load all available drivers
  and route steps to the appropriate driver based on step patterns

  Scenario: Use steps from multiple drivers
    Given I create file "auto-test.txt" with content "Auto driver test"
    When I read file "auto-test.txt"
    Then the file content should be "Auto driver test"
    And I delete file "auto-test.txt"
