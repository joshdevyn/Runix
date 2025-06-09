Feature: AI Driver Comprehensive Testing
  As a user of the Runix AI system
  I want to test all AI capabilities
  So that I can verify intelligent automation works correctly

  Background:
    Given the AI driver is available
    And the vision driver is available
    And the system driver is available
    And the web driver is available

  Scenario: Agent mode autonomous task completion
    When I run AI agent mode with task "Take a screenshot and analyze the current screen"
    Then the AI should plan the task into logical steps
    And the AI should execute each step successfully
    And the AI should generate a feature file artifact
    And the feature file should contain reproducible steps

  Scenario: Agent mode with user confirmation
    Given AI confirmation is enabled
    When I run AI agent mode with task "Create a test file and write hello world to it"
    Then the AI should request confirmation before each action
    And I should be able to approve or reject each step
    And the AI should only execute approved steps
    And skipped steps should be marked appropriately

  Scenario: Editor mode learning from user actions
    When I start AI editor mode with session "test-learning"
    And I perform a sequence of actions:
      | action_type | target | value |
      | screenshot  |        |       |
      | analyze     |        |       |
    And I stop the editor session
    Then the AI should have recorded all actions
    And the AI should generate a feature file from the learned sequence
    And the feature file should be executable by regular Runix

  Scenario: Ask mode providing assistance
    When I ask the AI "What elements can I interact with on the current screen?"
    Then the AI should take a screenshot
    And the AI should analyze the screen for interactive elements
    And the AI should provide a helpful response
    And the AI should offer to perform actions if applicable

  Scenario: Ask mode performing helpful actions
    When I ask the AI "Click the first button you can find"
    Then the AI should analyze the current screen
    And the AI should identify clickable elements
    And the AI should click the first button found
    And the AI should generate a feature file for the action

  Scenario: Complex multi-step autonomous workflow
    When I run AI agent mode with task "Take a screenshot, analyze it, create a summary file, and take another screenshot"
    Then the AI should break down the task into steps:
      | step_number | description | driver | action |
      | 1 | Take initial screenshot | WebDriver | takeScreenshot |
      | 2 | Analyze the screenshot | VisionDriver | analyzeScene |
      | 3 | Create summary file | SystemDriver | createFile |
      | 4 | Take final screenshot | WebDriver | takeScreenshot |
    And each step should execute successfully
    And the AI should generate comprehensive artifacts

  Scenario: Error handling and recovery
    Given the AI is executing a task that will encounter an error
    When the AI attempts an invalid action
    Then the AI should detect the failure
    And the AI should attempt alternative approaches
    And the AI should request human help if stuck
    And the AI should log the error for learning

  Scenario: Learning from corrections
    Given the AI makes an incorrect action
    When I provide a correction to the AI
    Then the AI should record the correction
    And the AI should update its understanding
    And the AI should apply the learning to future similar situations

  Scenario: Feature file generation and execution
    When the AI completes any task in any mode
    Then a feature file should be generated
    And the feature file should be valid Gherkin syntax
    And the feature file should be executable by Runix
    And the feature file should produce equivalent results when run

  Scenario: AI vision integration
    When the AI needs to understand the current screen
    Then it should use the vision driver to take a screenshot
    And it should analyze the screenshot for text and UI elements
    And it should use this information to make intelligent decisions
    And it should adapt its actions based on what it sees

  Scenario: AI system integration
    When the AI needs to perform system-level operations
    Then it should use the system driver appropriately
    And it should respect security boundaries
    And it should handle file operations safely
    And it should manage processes responsibly

  Scenario: Multi-mode AI workflow
    When I use the AI in editor mode to learn a workflow
    And then use agent mode to execute a similar task
    Then the AI should apply knowledge from editor mode
    And the agent should perform more accurately
    And the AI should demonstrate learning across modes

  Scenario: AI debugging and explanation
    When I request the AI to explain its reasoning
    Then the AI should provide clear explanations of its decisions
    And the AI should show the steps it planned to take
    And the AI should explain why it chose specific actions
    And the AI should indicate its confidence levels

  Scenario: Concurrent AI operations
    When I run multiple AI tasks simultaneously
    Then each task should maintain its own context
    And tasks should not interfere with each other
    And the AI should manage resources appropriately
    And all tasks should complete successfully

  Scenario: AI performance and optimization
    When I run AI tasks that should be optimized
    Then the AI should cache repeated operations
    And the AI should reuse analysis results when appropriate
    And the AI should complete tasks within reasonable time limits
    And the AI should use system resources efficiently
