import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  DidOpenTextDocumentParams,
  HoverParams,
  Definition,
  Location,
  Position,
  Range,
  URI,
  Hover,
  MarkupContent,
  MarkupKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import { parseFeatureFile, parseFeatureAst } from '../parser/parser';
import { DriverRegistry, StepDefinition } from '../drivers/driverRegistry';
import { DriverIntrospectionService } from './driverIntrospection';

// Create connection and documents
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
let stepDefinitions: StepDefinition[] = [];

// Initialize the language server
connection.onInitialize(async (params: InitializeParams) => {
  console.log('Runix language server initializing...');

  // Load all drivers
  const registry = DriverRegistry.getInstance();
  await registry.discoverDrivers();

  // Get step definitions from all drivers
  const introspectionService = DriverIntrospectionService.getInstance();
  stepDefinitions = await introspectionService.getAllStepDefinitions();

  console.log(`Loaded ${stepDefinitions.length} step definitions from ${registry.getAllDrivers().length} drivers`);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [' ', '\n', '\t', '"', '(', ')', '[', ']', '{', '}', ':', ',', '.']
      },
      hoverProvider: true,
      definitionProvider: true
    }
  };
});

// Validate feature files on change
documents.onDidChangeContent(async (change: { document: TextDocument }) => {
  const document = change.document;
  if (!isFeatureFile(document.uri)) return;

  const diagnostics: Diagnostic[] = [];

  try {
    // Parse the feature file to validate syntax
    parseFeatureFile(document.uri);

    // Validate step definitions
    const ast = parseFeatureAst(document.uri);
    if (ast.feature) {
      for (const child of ast.feature.children || []) {
        if (child.scenario) {
          for (const step of child.scenario.steps || []) {
            // Check if step matches any known step definition
            const matchingStep = findMatchingStepDefinition(step.text);
            if (!matchingStep) {
              // No matching step definition found
              const linePosition = document.positionAt(step.location.line - 1);
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                  start: { line: linePosition.line, character: 0 },
                  end: { line: linePosition.line, character: step.text.length }
                },
                message: `No matching step definition found: "${step.text}"`,
                source: 'runix-lsp'
              });
            }
          }
        }
      }
    }
  } catch (err: any) {
    // Syntax error in the feature file
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 }
      },
      message: err.message || String(err),
      source: 'runix-lsp'
    });
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
});

// Provide step suggestions for completion
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isFeatureFile(document.uri)) {
    return [];
  }

  const position = params.position;
  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: position.character }
  });

  // Check if we're in a step context (after Given, When, Then, And, But)
  const stepKeywords = ['Given', 'When', 'Then', 'And', 'But'];
  const isInStepContext = stepKeywords.some(keyword =>
    lineText.trim().startsWith(keyword) && lineText.includes(keyword + ' ')
  );

  if (!isInStepContext) {
    return [];
  }

  // Return completion items for step definitions
  return stepDefinitions.map(step => {
    const labelParts: string[] = step.pattern.split(/(\(.+?\))/g);
    const label = labelParts.map((part: string) => {
      if (part.startsWith('(') && part.endsWith(')')) {
        return `"${part.substring(1, part.length - 1)}"`;
      }
      return part;
    }).join('');

    return {
      label,
      kind: CompletionItemKind.Function,
      detail: `${step.description} (${findDriverNameForStep(step)})`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: generateStepDocumentation(step)
      }
    };
  });
});

// Provide hover information
connection.onHover((params: HoverParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isFeatureFile(document.uri)) {
    return null;
  }

  // Get the step at the current position
  const step = getStepAtPosition(document, params.position);
  if (!step) {
    return null;
  }

  // Find matching step definition
  const matchingStep = findMatchingStepDefinition(step);
  if (!matchingStep) {
    return null;
  }

  const driverName = findDriverNameForStep(matchingStep);

  // Return hover information
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: generateStepDocumentation(matchingStep, true, driverName)
    }
  };
});

// Provide go to definition
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isFeatureFile(document.uri)) {
    return null;
  }

  // Get the step at the current position
  const step = getStepAtPosition(document, params.position);
  if (!step) {
    return null;
  }

  // For now, we don't have actual definition locations
  // In a real implementation, we would return the location of the step definition
  return null;
});

// Helper function to check if file is a feature file
function isFeatureFile(uri: string): boolean {
  return uri.endsWith('.feature') || uri.endsWith('.spec');
}

// Helper function to find matching step definition
function findMatchingStepDefinition(stepText: string): StepDefinition | undefined {
  for (const step of stepDefinitions) {
    // Convert pattern to regex for matching
    const patternRegex = convertPatternToRegex(step.pattern);
    if (patternRegex.test(stepText)) {
      return step;
    }
  }
  return undefined;
}

// Helper function to convert step pattern to regex
function convertPatternToRegex(pattern: string): RegExp {
  // Replace parameter placeholders with regex groups
  let regexPattern = pattern
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\?/g, '\\?')
    .replace(/\+/g, '\\+')
    .replace(/\*/g, '\\*')
    .replace(/\$/g, '\\$')
    .replace(/\^/g, '\\^');

  // Replace parameter placeholders with regex patterns
  regexPattern = regexPattern.replace(/"\(.*?\)"/g, '".*?"');

  return new RegExp(`^${regexPattern}$`);
}

// Helper function to find driver name for a step
function findDriverNameForStep(step: StepDefinition): string {
  for (const driver of DriverRegistry.getInstance().getAllDrivers()) {
    if (driver.supportedSteps?.some(s => s.id === step.id)) {
      return driver.name;
    }
  }
  return 'Unknown Driver';
}

// Helper function to get step text at position
function getStepAtPosition(document: TextDocument, position: Position): string | null {
  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
  }).trim();

  // Check if the line is a step
  const stepKeywords = ['Given', 'When', 'Then', 'And', 'But'];
  for (const keyword of stepKeywords) {
    if (lineText.startsWith(keyword + ' ')) {
      return lineText.substring(keyword.length).trim();
    }
  }

  return null;
}

// Helper function to generate step documentation
function generateStepDocumentation(step: StepDefinition, includeExamples: boolean = true, driverName: string = ''): string {
  let doc = `### ${step.description}\n\n`;

  if (driverName) {
    doc += `**Driver:** ${driverName}\n\n`;
  }

  doc += `**Pattern:** \`${step.pattern}\`\n\n`;

  if (step.parameters && step.parameters.length > 0) {
    doc += '**Parameters:**\n\n';
    for (const param of step.parameters) {
      const defaultValue = param.default !== undefined ? ` (default: ${param.default})` : '';
      const required = param.required ? ' (required)' : '';
      doc += `- \`${param.name}\`: ${param.description} - ${param.type}${required}${defaultValue}\n`;
    }
    doc += '\n';
  }

  if (includeExamples && step.examples && step.examples.length > 0) {
    doc += '**Examples:**\n\n';
    for (const example of step.examples) {
      doc += `- ${example}\n`;
    }
  }

  return doc;
}

// Start the server
documents.listen(connection);
connection.listen();
