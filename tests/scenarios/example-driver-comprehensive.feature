Feature: Example Driver Comprehensive Testing
  As a user of the Runix automation engine
  I want to test all example driver capabilities
  So that I can verify the driver works correctly

  Background:
    Given the example driver is available

  Scenario: Basic echo functionality
    When I echo the message "Hello Runix!"
    Then the response should contain "Hello Runix!"

  Scenario: Mathematical operations
    When I add 15 and 25
    Then the result should be 40

  Scenario: Timing operations
    When I wait for 500 milliseconds
    Then the operation should complete successfully

  Scenario: Multiple operations sequence
    Given I echo the message "Starting sequence"
    When I add 10 and 20
    And I wait for 200 milliseconds
    And I echo the message "Sequence complete"
    Then all operations should succeed

  Scenario: Error handling
    When I attempt an invalid operation
    Then the driver should handle the error gracefully

  Scenario: Performance testing
    When I perform multiple quick operations:
      | operation | parameter1 | parameter2 |
      | echo      | "test1"    |            |
      | add       | 5          | 10         |
      | echo      | "test2"    |            |
      | add       | 8          | 12         |
    Then all operations should complete within reasonable time
