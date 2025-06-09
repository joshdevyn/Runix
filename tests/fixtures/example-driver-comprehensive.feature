Feature: Example Driver Comprehensive Testing
  As a user of the Runix automation engine
  I want to test all example driver capabilities
  So that I can verify the driver works correctly

  Scenario: Basic echo functionality
    When echo the message "Hello Runix!"
    And echo the message "Testing basic functionality"
    And echo the message "Example driver is working"

  Scenario: Mathematical operations
    When add 15 and 25
    And add 100 and 200
    And add 5 and 10

  Scenario: Timing operations
    When wait for 500 milliseconds
    And wait for 200 milliseconds
    And wait for 100 milliseconds

  Scenario: Multiple operations sequence
    When echo the message "Starting sequence"
    And add 10 and 20
    And wait for 200 milliseconds
    And echo the message "Sequence complete"
    And add 50 and 75

  Scenario: Complex workflow demonstration
    When echo the message "Complex workflow starting"
    And wait for 300 milliseconds
    And add 123 and 456
    And echo the message "Math operation completed"
    And wait for 150 milliseconds
    And add 1000 and 2000
    And echo the message "Workflow complete"

  Scenario: Performance testing with multiple operations
    When echo the message "Performance test starting"
    And add 1 and 1
    And add 2 and 2
    And add 3 and 3
    And add 4 and 4
    And add 5 and 5
    And wait for 100 milliseconds
    And echo the message "Performance test complete"
