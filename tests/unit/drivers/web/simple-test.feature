Feature: Simple Web Driver Test
  Basic test to verify the web driver is working

  Scenario: Simple Navigation Test
    When I open "file:///c:/_Runix/drivers/web-driver/test/comprehensive-test-page.html"
    Then the page title should contain "Comprehensive Web Driver Test Page"
