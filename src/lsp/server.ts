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
import { driverIntrospectionService } from './driverIntrospection';
import { Logger } from '../utils/logger';

// Create connection and documents
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const logger = Logger.getInstance();
let stepDefinitions: StepDefinition[] = [];

// Initialize the language server
connection.onInitialize(async (params: InitializeParams) => {
  logger.info('Runix language server initializing...');

  // Load all drivers
  const driverRegistry = DriverRegistry.getInstance();
  try {
    await driverRegistry.initialize(); // This will call discoverDrivers internally
  } catch (error) {
    logger.error('Failed to initialize LSP driver registry', { 
      class: 'LSPServer',
      method: 'onInitialize' 
    }, error);
  }

  // Get step definitions from all drivers
  stepDefinitions = await driverIntrospectionService.getAllStepDefinitions();

  // Fix: Use listDriverIds() instead of getAllDrivers()
  const driverIds = driverRegistry.listDriverIds();
  logger.info(`Loaded ${stepDefinitions.length} step definitions from ${driverIds.length} drivers`);

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

// Handle completion requests
connection.onCompletion(async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
  const document = documents.get(textDocumentPosition.textDocument.uri);
  if (!document || !isFeatureFile(document.uri)) {
    return [];
  }
  
  const position = textDocumentPosition.position;
  const text = document.getText();
  const lines = text.split('\n');
  const currentLine = lines[position.line] || '';
  
  // Check if we're in a step line
  if (isStepLine(currentLine)) {
    return getStepCompletions();
  }
  
  return [];
});

// Handle hover requests
connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isFeatureFile(document.uri)) {
    return null;
  }
  
  const position = params.position;
  const text = document.getText();
  const lines = text.split('\n');
  const currentLine = lines[position.line] || '';
  
  if (isStepLine(currentLine)) {
    const stepText = extractStepText(currentLine);
    const matchingStep = findMatchingStepDefinition(stepText);
    
    if (matchingStep) {
      const contents: MarkupContent = {
        kind: MarkupKind.Markdown,
        value: `**${matchingStep.description}**\n\nAction: \`${matchingStep.action}\`\n\nPattern: \`${matchingStep.pattern}\``
      };
      
      return {
        contents,
        range: {
          start: { line: position.line, character: 0 },
          end: { line: position.line, character: currentLine.length }
        }
      };
    }
  }
  
  return null;
});

// Handle definition requests
connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Definition | null> => {
  // Implementation for go-to-definition
  return null;
});

// Helper functions
function isFeatureFile(uri: string): boolean {
  return uri.endsWith('.feature');
}

function isStepLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(Given|When|Then|And|But)\s+/.test(trimmed);
}

function extractStepText(line: string): string {
  const match = line.trim().match(/^(Given|When|Then|And|But)\s+(.+)$/);
  return match ? match[2] : '';
}

function findMatchingStepDefinition(stepText: string): any {
  for (const step of stepDefinitions) {
    if (matchesStepPattern(stepText, step.pattern)) {
      return step;
    }
  }
  return null;
}

function matchesStepPattern(stepText: string, pattern: string): boolean {
  const regexPattern = pattern.replace(/\(([^)]+)\)/g, '(.+?)');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(stepText);
}

function getStepCompletions(): CompletionItem[] {
  return stepDefinitions.map(step => ({
    label: step.pattern,
    kind: CompletionItemKind.Function,
    detail: step.description || step.pattern,
    // Remove: documentation: step.examples?.join('\n'),
    documentation: step.description || `Action: ${step.action}`,
    insertText: step.pattern
  }));
}

// Start listening
documents.listen(connection);
connection.listen();
