Feature: Echo Driver Test Fixture
  As a test fixture
  I want to validate echo functionality
  So that integration tests can verify driver communication

  @fixture @echo
  Scenario: Basic echo test
    Given echo the message "Test fixture message"
    When echo the message "Integration test working"
    Then echo the message "All systems operational"

  @fixture @echo @data
  Scenario: Echo with various data types
    Given echo the message "String data test"
    When echo the message "123456789"
    Then echo the message "Special chars: !@#$%^&*()"
