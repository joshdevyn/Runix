Feature: Vision Driver Comprehensive Testing
  As a user of the Runix automation engine
  I want to test all vision driver capabilities
  So that I can verify computer vision operations work correctly

  Background:
    Given the vision driver is available
    And I have test images available

  Scenario: Text extraction from screenshots
    When I extract text from screenshot
    Then the driver should return detected text blocks
    And each text block should have confidence scores
    And the results should include bounding box coordinates

  Scenario: UI element detection
    When I detect UI elements in screenshot
    Then the driver should identify buttons, fields, and links
    And each element should have type and location information
    And confidence scores should be provided for each element

  Scenario: Scene analysis
    When I analyze scene in screenshot
    Then the driver should provide comprehensive scene information
    And the analysis should include both text and UI elements
    And a scene summary should be generated

  Scenario: Image template matching
    Given I have a template image to find
    When I find image "button-template" in screenshot
    Then the driver should locate the template if present
    And provide confidence and location information

  Scenario: OCR language processing
    When I configure OCR for different languages
    And I extract text from multilingual content
    Then the driver should handle different character sets appropriately

  Scenario: Vision processing workflow
    Given I have a complex UI screenshot
    When I perform complete vision analysis:
      | operation     | expected_results           |
      | extract_text  | text blocks with positions |
      | detect_ui     | interactive elements       |
      | analyze_scene | comprehensive summary      |
    Then all vision operations should complete successfully
    And results should be consistent across operations
