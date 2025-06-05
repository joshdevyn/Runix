Feature: AI Driver Comprehensive Testing
  As a user of the Runix automation engine
  I want to test all AI driver capabilities
  So that I can verify AI orchestration works correctly

  Background:
    Given the AI driver is available
    And other drivers are discoverable

  Scenario: Intent analysis
    When I analyze intent "I want to login to the application"
    Then the driver should extract the intent correctly
    And suggest relevant automation steps
    And provide confidence scores

  Scenario: Driver discovery
    When I discover available drivers
    Then the AI driver should find all active drivers
    And collect their capabilities and step definitions
    And organize them for intelligent orchestration

  Scenario: Feature generation from intent
    Given I have user intent "Upload a document to the website"
    When I generate feature for intent "Upload a document to the website"
    Then the AI should create a valid Gherkin feature
    And the feature should use appropriate driver steps
    And the steps should be logically sequenced

  Scenario: Workflow orchestration
    Given I have a multi-step automation workflow
    When I orchestrate workflow with multiple drivers
    Then the AI should coordinate between different drivers
    And provide execution planning
    And handle inter-driver dependencies

  Scenario: Complex scenario generation
    When I provide complex user intent "Test the login flow, then navigate to settings and update profile"
    And I generate feature for this complex intent
    Then the AI should break down the task into logical steps
    And coordinate multiple driver capabilities
    And create comprehensive test scenarios

  Scenario: AI-powered step matching
    Given I have scene data from vision driver
    And user intent for automation
    When I match intent to available steps with scene context
    Then the AI should suggest contextually appropriate steps
    And prioritize steps based on scene analysis
    And provide confidence ratings for suggestions

  Scenario: Intelligent error handling
    When I provide ambiguous or unclear intent
    Then the AI driver should request clarification
    Or provide multiple interpretation options
    And guide the user toward valid automation steps
