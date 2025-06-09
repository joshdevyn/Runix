Feature: AI Driver Capabilities Testing

  Scenario: Test AI driver capabilities inquiry
    When I ask "What are your main capabilities and how can you help me?"
    Then I should receive a comprehensive response about AI driver features
