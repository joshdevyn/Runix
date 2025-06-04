import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import * as messages from '@cucumber/messages';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range, Position } from 'vscode-languageserver-types';
import { v4 as uuidv4 } from 'uuid';

// Define interfaces for our simplified Gherkin AST structure
// This helps decouple the LSP server from the raw @cucumber/gherkin AST

export interface ParsedGherkinLocation {
  line: number;
  column?: number; // Column is often 1-based from Gherkin
}

export interface ParsedGherkinStep {
  id: string;
  keyword: string;
  text: string;
  location: ParsedGherkinLocation;
  range: Range; // LSP-friendly range
  // Add other relevant properties like 'dataTable' or 'docString' if needed later
}

export interface ParsedGherkinScenario {
  id: string;
  keyword: string;
  name: string;
  location: ParsedGherkinLocation;
  steps: ParsedGherkinStep[];
  // Add 'tags', 'description', 'examples' if needed
}

export interface ParsedGherkinBackground {
  id: string;
  keyword: string;
  name: string; // Backgrounds can have names/descriptions
  location: ParsedGherkinLocation;
  steps: ParsedGherkinStep[];
}

export interface ParsedGherkinFeature {
  keyword: string;
  name: string;
  location: ParsedGherkinLocation;
  language: string;
  background?: ParsedGherkinBackground;
  scenarios: ParsedGherkinScenario[];
  // Add 'tags', 'description' if needed
}

export interface ParseResult {
  feature: ParsedGherkinFeature | null;
  diagnostics: Diagnostic[];
}

/**
 * Parses a Gherkin document using @cucumber/gherkin.
 *
 * Adhering to NASA's Coding Commandment #1 (Clear and Concise Code):
 * This function aims to clearly translate Gherkin's AST into a simplified,
 * LSP-friendly structure.
 *
 * Adhering to NASA's Coding Commandment #7 (Handle Errors Gracefully):
 * Parsing errors from the Gherkin library are caught and converted
 * into LSP Diagnostics.
 *
 * @param document The TextDocument to parse.
 * @returns A Promise resolving to a ParseResult containing the simplified feature AST and any diagnostics.
 */
export async function parseGherkinDocument(document: TextDocument): Promise<ParseResult> {
  const diagnostics: Diagnostic[] = [];
  let parsedFeature: ParsedGherkinFeature | null = null;
  const content = document.getText();

  try {
    // Use the direct parser approach - this is the recommended way for @cucumber/gherkin v26+
    const builder = new AstBuilder(() => uuidv4());
    const matcher = new GherkinClassicTokenMatcher();
    const parser = new Parser(builder, matcher);
    
    const gherkinDocument = parser.parse(content);
    
    if (gherkinDocument && gherkinDocument.feature) {
      const featureAst = gherkinDocument.feature;
      
      const mapLocation = (loc?: messages.Location | null): ParsedGherkinLocation => {
        return {
          line: loc?.line ?? 0,
          column: loc?.column ?? 0,
        };
      };

      // Refined mapRange function
      const mapRange = (element: { location?: messages.Location | null, keyword?: string | null, name?: string | null, text?: string | null, nodeType?: string }): Range => {
        const startLine = element.location?.line ? element.location.line - 1 : 0; // LSP is 0-indexed
        const startCol = element.location?.column ? element.location.column - 1 : 0; // LSP is 0-indexed

        let endLine = startLine;
        let endCol = startCol;

        if (element.nodeType === 'Step') {
            // For steps, range covers keyword + text
            const textContent = element.text || "";
            const keywordAndSpace = (element.keyword || "").length + (element.keyword && textContent ? 1 : 0);
            const lines = textContent.split('\n');
            if (lines.length > 1) {
                endLine = startLine + lines.length - 1;
                endCol = lines[lines.length - 1].length;
            } else {
                endCol = startCol + keywordAndSpace + lines[0].length;
            }
        } else if (element.nodeType === 'Feature' || element.nodeType === 'Scenario' || element.nodeType === 'Background') {
            // For Feature, Scenario, Background, range covers keyword + name (if present) on the first line
            const nameFirstLine = (element.name || "").split('\n')[0];
            endCol = startCol + (element.keyword || "").length + (element.keyword && nameFirstLine ? 1 : 0) + nameFirstLine.length;
        } else if (element.keyword) { // Fallback for other elements with a keyword
             endCol = startCol + (element.keyword || "").length;
        } else { // Minimal range if no other info
            endCol = startCol + 1;
        }

        // Ensure endCol is not less than startCol if on the same line
        if (endLine === startLine && endCol < startCol) {
            endCol = startCol + 1; 
        }
        // Ensure range is valid
        if (endLine < startLine || (endLine === startLine && endCol < startCol)) {
            return Range.create(Position.create(startLine, startCol), Position.create(startLine, startCol +1));
        }

        return Range.create(Position.create(startLine, startCol), Position.create(endLine, endCol));
      };
      
      const mapStep = (step: messages.Step): ParsedGherkinStep => ({
        id: step.id || uuidv4(),
        keyword: step.keyword || '',
        text: step.text || '',
        location: mapLocation(step.location),
        range: mapRange({location: step.location, keyword: step.keyword, text: step.text, nodeType: 'Step'}),
      });

      let background: ParsedGherkinBackground | undefined = undefined;
      const backgroundAstNode = featureAst.children?.find(child => child.background)?.background;
      if (backgroundAstNode) {
        background = {
          id: backgroundAstNode.id || uuidv4(),
          keyword: backgroundAstNode.keyword || 'Background',
          name: backgroundAstNode.name || '',
          location: mapLocation(backgroundAstNode.location),
          steps: backgroundAstNode.steps?.map(mapStep) || [],
        };
      }
      
      parsedFeature = {
        keyword: featureAst.keyword || 'Feature',
        name: featureAst.name || '',
        location: mapLocation(featureAst.location),
        language: featureAst.language || 'en',
        background: background,
        scenarios: featureAst.children?.filter(child => child.scenario).map(child => {
          const scenarioAst = child.scenario!;
          return {
            id: scenarioAst.id || uuidv4(),
            keyword: scenarioAst.keyword || 'Scenario',
            name: scenarioAst.name || '',
            location: mapLocation(scenarioAst.location),
            steps: scenarioAst.steps?.map(mapStep) || [],
          };
        }) || [],
      };
    }

  } catch (error: any) {
    // Handle parsing errors gracefully
    if (error.location) {
      const line = error.location.line ? error.location.line - 1 : 0;
      const column = error.location.column ? Math.max(0, error.location.column - 1) : 0;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: Range.create(Position.create(line, column), Position.create(line, column + 1)),
        message: error.message || 'Gherkin parsing error',
        source: 'gherkin-parser',
      });
    } else {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: Range.create(Position.create(0, 0), Position.create(0, 1)),
        message: `Unexpected error during Gherkin parsing: ${error.message}`,
        source: 'gherkin-parser-internal',
      });
    }
  }

  return {
    feature: parsedFeature,
    diagnostics,
  };
}

// Add a helper to convert 1-based Gherkin location to 0-based LSP Position
export function gherkinLocationToLspPosition(location: ParsedGherkinLocation): Position {
  return Position.create(
    Math.max(0, location.line - 1),
    Math.max(0, location.column ? location.column - 1 : 0)
  );
}
