Feature: Comprehensive Web Driver Testing with Local Test Page
  Test all web driver functionality using a comprehensive local HTML test page
  Including all web driver actions, element interactions, and edge cases

  Background:
    Given I open the comprehensive test page

  Scenario: Basic Navigation and Page Operations
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    Then the page title should contain "Comprehensive Web Driver Test Page"
    And the current URL should contain "comprehensive-test-page.html"
    When I go back
    And I go forward  
    And I reload the page
    Then the page should be loaded

  Scenario: Element Interaction and Clicking
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I click on "#click-test"
    And I should see "Single click detected!"
    And I double click on "#double-click-test"
    And I should see "Double click detected!"
    And I right click on "#right-click-test" 
    And I should see "Right click detected!"
    And I hover over "#hover-test"
    And I should see "Hover detected!"
    And I focus on "#focus-test"
    And I blur from "#focus-test"
    Then all interactions should complete successfully

  Scenario: Text Input and Form Handling
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I type "John Doe" into "#customer-name"
    And I clear the field "#customer-name"
    And I type "Jane Smith" into "#customer-name"
    And I type "jane@example.com" into "#customer-email"
    And I type "555-0123" into "#customer-phone"
    And I select "medium" from "#size-select"
    And I check the checkbox "#topping-bacon"
    And I uncheck the checkbox "#topping-bacon"
    And I check the checkbox "#topping-cheese"
    And I type "Test comments here" into "#comments"
    Then the form should have the correct values

  Scenario: Element Properties and Attributes
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    Then I should get text from "#main-heading"
    And I should get inner text from "#main-heading"
    And I should get inner HTML from "#page-description"
    And I should get attribute "action" from "#test-form"
    And I should get property "tagName" from "#test-form"
    And I should get value from "#customer-name"
    And I should get CSS property "color" from "#red-text"

  Scenario: Element State Checks
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    Then element "#main-heading" should be visible
    And element "#hidden-element" should be hidden
    And element "#enabled-input" should be enabled
    And element "#disabled-input" should be disabled
    And element "#editable-field" should be editable
    And element "#checked-checkbox" should be checked
    And element "#unchecked-checkbox" should not be checked

  Scenario: Wait Operations with Dynamic Content
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I click on "#load-delayed-content"
    And I wait for element "#delayed-content" to be visible within 5000ms
    And I wait for element "#delayed-content" to contain text "delay" within 5000ms
    And I wait for URL to contain "comprehensive-test-page" within 1000ms
    And I wait for page to be loaded
    Then all wait operations should succeed

  Scenario: Screenshots and Media
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I take a screenshot named "full-page-test"
    And I take a screenshot of element "#main-heading"
    Then screenshots should be saved successfully

  Scenario: JavaScript Execution
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I execute JavaScript "document.title"
    And I execute JavaScript "document.querySelector('#main-heading').textContent"
    And I execute JavaScript "window.location.href"
    And I click on "#js-test"
    Then JavaScript execution should return correct values

  Scenario: Frame Handling
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I switch to frame "#test-frame"
    And I type "Frame input test" into "#frame-input"
    And I click on "#frame-button"
    And I switch to main frame
    Then frame operations should work correctly

  Scenario: Shadow DOM Support
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I query element in shadow DOM with host "#shadow-host" and selector "#shadow-button"
    And I click element in shadow DOM with host "#shadow-host" and selector "#shadow-button"
    And I type "shadow test" in shadow DOM element with host "#shadow-host" and selector "#shadow-input"
    Then shadow DOM operations should work correctly

  Scenario: Window and Viewport Management
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I set viewport size to 1200x800
    And I get viewport size
    And I maximize window
    Then window operations should work correctly

  Scenario: Cookie Management
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I add cookie with name "test" and value "value123"
    And I get all cookies
    And I delete cookie "test"
    And I delete all cookies
    Then cookie operations should work correctly

  Scenario: Local and Session Storage
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I set local storage "newTestKey" to "newTestValue"
    And I get local storage "newTestKey"
    And I get local storage "testKey"
    And I remove local storage "newTestKey"
    And I set session storage "newSessionKey" to "newSessionValue"
    And I get session storage "newSessionKey"
    And I get session storage "sessionKey"
    Then storage operations should work correctly

  Scenario: Drag and Drop Operations
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I drag element "#draggable" to "#dropzone"
    Then drag and drop should work correctly

  Scenario: Mobile Touch Gestures
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I tap on element "#main-heading"
    And I swipe from coordinates (100,100) to (300,300)
    Then touch gestures should work correctly

  Scenario: Alert Handling
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I click on "#alert-btn"
    And I get alert text
    And I accept alert
    And I click on "#confirm-btn"
    And I dismiss alert
    Then alert handling should work correctly

  Scenario: File Upload
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I upload file "test-file.txt" to "#file-upload"
    Then file upload should work correctly

  Scenario: Advanced Keyboard Operations
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I focus on "#customer-name"
    And I press key "Tab"
    And I press keys "Hello World"
    And I press key "Enter"
    Then keyboard operations should work correctly

  Scenario: Performance and Reliability Test
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I perform 10 rapid clicks on "#rapid-click-target"
    And I perform 5 rapid navigation operations
    And I take multiple screenshots
    Then performance should be acceptable
    And no errors should occur

  Scenario: Error Handling and Edge Cases
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I try to interact with non-existent element "#non-existent-selector"
    Then I should get appropriate error message
    When I try to navigate to invalid URL "invalid://url"
    Then I should handle the error gracefully
    When I try to wait for element "#very-slow-element" with very short timeout
    Then timeout error should be handled properly

  Scenario: CSS Properties and Visual Elements
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    Then I should get CSS property "color" from "#red-text"
    And I should get CSS property "background-color" from "#blue-bg"
    And I should get CSS property "border" from "#bordered-element"
    And element "#red-text" should be visible
    And element "#blue-bg" should be visible

  Scenario: Form Validation and States
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I type "test@example.com" into "#customer-email"
    And I select "large" from "#size-select"
    And I check the checkbox "#topping-pepperoni"
    And I click on "#delivery-home"
    And I type "Special delivery instructions" into "#comments"
    And I click on "#submit-btn"
    Then the form should validate correctly

  Scenario: Dynamic Element Visibility
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    Then element "#dynamic-element" should be hidden
    When I click on "#show-element"
    Then element "#dynamic-element" should be visible
    When I click on "#hide-element"
    Then element "#dynamic-element" should be hidden

  Scenario: Multiple Element Interactions
    When I open "file:///c:/_Runix/tests/fixtures/comprehensive-test-page.html"
    And I click on "#customer-name"
    And I type "Multi Test User" into "#customer-name"
    And I press key "Tab"
    And I type "multi@test.com" into "#customer-email"
    And I press key "Tab"
    And I type "555-MULTI" into "#customer-phone"
    Then all form fields should contain the correct values
