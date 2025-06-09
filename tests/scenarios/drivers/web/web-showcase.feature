Feature: Web Automation Showcase
  As a demonstration of Runix capabilities
  I want to showcase comprehensive web automation
  To impress users with the power and flexibility of the platform

  @showcase @demo @impressive
  Scenario: Complete Web Automation Showcase
    # Navigation and Page Verification
    Given I open the browser at "https://example.com"
    Then I should see "Example Domain"
    And the page title should be "Example Domain"
    And I take a screenshot named "example_homepage.png"
    
    # Form Automation
    When I navigate to "https://httpbin.org/forms/post"
    And I enter "Runix Demo User" into the "custname" field
    And I enter "demo@runix.com" into the "custemail" field
    And I enter "555-123-4567" into the "custtel" field
    And I enter "This is a demo of Runix web automation capabilities!" into "comments"
    And I select "large" from "size"
    And I check the "topping" checkbox
    And I take a screenshot named "form_filled.png"
    And I click the "submit" button
    Then I should see "form"
    
    # Mouse Interactions and Hover Effects
    When I navigate to "https://the-internet.herokuapp.com/hovers"
    And I hover over ".figure:first-child img"
    Then I should see "name: user1"
    When I hover over ".figure:nth-child(2) img"
    Then I should see "name: user2"
    And I take a screenshot named "hover_effects.png"
    
    # Drag and Drop
    When I navigate to "https://the-internet.herokuapp.com/drag_and_drop"
    And I take a screenshot named "before_drag_drop.png"
    And I drag "#column-a" to "#column-b"
    And I take a screenshot named "after_drag_drop.png"
    Then I should see "B" in "#column-a header"
    
    # Dynamic Content and AJAX
    When I navigate to "https://the-internet.herokuapp.com/dynamic_content"
    And I click "a[href='#']"
    And I wait for "div.large-10" to appear
    And I take a screenshot named "dynamic_content.png"
    Then the "div.large-10" should be visible
    
    # Table Interactions
    When I navigate to "https://the-internet.herokuapp.com/tables"
    And I click "table#table1 thead tr th:nth-child(1)"
    And I take a screenshot named "table_sorted.png"
    Then the table should be sorted
    
    # JavaScript Execution and DOM Manipulation
    When I navigate to "https://example.com"
    And I execute JavaScript "document.body.style.backgroundColor = 'lightgreen'"
    And I execute JavaScript "document.querySelector('h1').style.color = 'blue'"
    And I execute JavaScript "document.querySelector('h1').innerHTML = 'Modified by Runix!'"
    And I take a screenshot named "javascript_modified.png"
    Then I should see "Modified by Runix!"
    
    # Window Management
    When I maximize window
    And I set window size to 1200x800
    And I take a screenshot named "window_resized.png"
    
    # Performance Testing
    When I navigate to "https://the-internet.herokuapp.com/dynamic_loading/1"
    And I click "#start button"
    And I wait for "#loading" to disappear
    And I wait for "#finish" to appear
    And I take a screenshot named "dynamic_loading_complete.png"
    Then I should see "Hello World!"
    
    # Final Screenshot
    And I take a full page screenshot
    
  @showcase @mobile @responsive
  Scenario: Responsive Design Showcase
    Given I navigate to "https://example.com"
    
    # Mobile View
    When I set window size to 320x568
    And I take a screenshot named "mobile_320x568.png"
    
    # Tablet View
    When I set window size to 768x1024
    And I take a screenshot named "tablet_768x1024.png"
    
    # Desktop View
    When I set window size to 1920x1080
    And I take a screenshot named "desktop_1920x1080.png"
    
    # Ultra-wide View
    When I set window size to 2560x1440
    And I take a screenshot named "ultrawide_2560x1440.png"
    
    Then I should have screenshots for all viewports
    
  @showcase @performance @timing
  Scenario: Performance and Timing Showcase
    Given I navigate to "https://httpbin.org"
    
    # Speed test with timing
    When I wait for "body" to appear
    And I navigate to "https://httpbin.org/delay/2"
    And I wait 3 seconds
    Then I should see "args"
    
    # Rapid navigation test
    When I navigate to "https://httpbin.org/json"
    And I wait for "pre" to appear
    And I navigate to "https://httpbin.org/xml"
    And I wait for "slideshow" to appear
    And I navigate to "https://httpbin.org/html"
    And I wait for "body" to appear
    
    Then I should demonstrate fast navigation capabilities
