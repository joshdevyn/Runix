Feature: Enhanced AI Driver Test
  
  Scenario: Test AI Driver Information
    When I call AI driver with action "getInfo"
    Then I should get driver information

  Scenario: Test Provider Management
    When I call AI driver with action "getProviders"
    Then I should get available providers
    
  Scenario: Test Active Provider
    When I call AI driver with action "getActiveProvider"
    Then I should get current active provider
