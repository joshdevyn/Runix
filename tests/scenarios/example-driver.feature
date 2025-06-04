Feature: Example Driver Testing
  This feature tests the example driver functionality

  Scenario: Basic echo test
    Given echo the message "Hello, Runix!"
    When echo the message "Testing the driver system"
    Then echo the message "This is working!"

  Scenario: Math operations
    Given add 5 and 3
    When add 10 and 20
    Then add 123 and 456

  Scenario: Waiting
    Given wait for 1000 milliseconds
    When wait for 500 milliseconds
    Then echo the message "Done waiting"
