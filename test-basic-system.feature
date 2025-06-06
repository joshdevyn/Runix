Feature: Basic System Driver Test
  As a user of the Runix automation engine
  I want to test basic system driver functionality
  So that I can verify the pattern fixes work

  Scenario: File operations workflow
    When I create file "test-output.txt" with content "Hello System Driver!"
    And I read file "test-output.txt"
    Then the file content should be "Hello System Driver!"
    And I delete file "test-output.txt"

  Scenario: Command execution
    When I execute command "echo System test successful"
    Then the command output should contain "System test successful"
