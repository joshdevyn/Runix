Feature: System Driver Comprehensive Testing
  As a user of the Runix automation engine
  I want to test all system driver capabilities
  So that I can verify system operations work correctly

  Background:
    Given the system driver is available
    And I have appropriate file system permissions

  Scenario: File operations workflow
    When I create file "test-output.txt" with content "Hello System Driver!"
    And I read file "test-output.txt"
    Then the file content should be "Hello System Driver!"
    And I delete file "test-output.txt"

  Scenario: Directory operations
    When I create file "temp/nested/test.txt" with content "Nested file test"
    And I read file "temp/nested/test.txt"
    Then the file should exist and contain "Nested file test"

  Scenario: Command execution
    When I execute command "echo System test successful"
    Then the command output should contain "System test successful"

  Scenario: Process management
    When I start process "node -e \"setTimeout(() => process.exit(0), 1000)\""
    Then the process should start successfully
    And I should be able to manage the process

  Scenario: File system safety
    When I attempt to access restricted paths
    Then the driver should enforce security restrictions

  Scenario: Multiple file operations
    Given I create multiple test files:
      | filename    | content           |
      | file1.txt   | Content one       |
      | file2.txt   | Content two       |
      | file3.txt   | Content three     |
    When I read all created files
    Then each file should contain its expected content
    And I clean up all test files
