Feature: Multi-Driver Automation Demo
  Demonstrate seamless integration between different automation drivers
  showcasing Runix's automatic driver loading and intelligent step routing

  Scenario: Complete end-to-end workflow with multiple drivers
    # System Driver: File operations and environment setup
    Given I create file "automation-log.txt" with content "Starting multi-driver workflow at $(date)"
    And I create file "test-config.json" with content '{"environment":"demo","version":"1.0"}'
    And I read file "test-config.json"
    
    # Web Driver: Browser automation with form interaction
    When I open the browser at "https://httpbin.org/forms/post"
    And I enter "Runix Demo User" into the "custname" field
    And I enter "feedback@runix.com" into the "custemail" field
    And I take a screenshot "01-form-filled.png"
    And I click the "submit" button
    And I take a screenshot "02-form-submitted.png"
    
    # Vision Driver: OCR and visual analysis
    Then I extract text from screenshot
    And I detect UI elements in screenshot
    And I analyze scene in screenshot
    
    # AI Driver: Intelligent analysis and decision making
    And I analyze intent "What was the purpose of this automation workflow?"
    And I generate answer for "Summarize the automation steps completed"
    
    # System Driver: Results verification and cleanup
    And the file content should be '{"environment":"demo","version":"1.0"}'
    And I write "Workflow completed successfully" to file "automation-log.txt"
    And I read file "automation-log.txt"
    
    # Final cleanup
    And I delete file "test-config.json"
    And I delete file "automation-log.txt"

  Scenario: AI-Driven Step Generation
    # AI Driver generates dynamic steps based on intent
    Given I analyze intent "Create a file, open a website, and take a screenshot"
    When I orchestrate workflow
    Then I generate feature for intent "Automated testing workflow"
    
  Scenario: Vision and System Integration
    # System creates test image, Vision analyzes it
    Given I create file "test-data.txt" with content "RUNIX AUTOMATION TEST"
    When I take a screenshot "desktop-state.png"
    Then I extract text from screenshot
    And I find image "test-data.txt" in screenshot
    And I delete file "test-data.txt"

  Scenario: Cross-Driver Data Flow
    # Demonstrate data passing between different drivers
    Given I create file "shared-data.json" with content '{"message":"Hello from System Driver"}'
    When I read file "shared-data.json"
    And I generate answer for "What message is in the shared data file?"
    Then I open the browser at "https://httpbin.org/get"
    And I take a screenshot "api-response.png"
    And I extract text from screenshot
    And I delete file "shared-data.json"
