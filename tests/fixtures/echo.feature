Feature: Echo Test

  Scenario: Test echo commands
    Given echo the message "Hello, testing!"
    When echo the message "This is a test"
    Then echo the message "Testing completed"
