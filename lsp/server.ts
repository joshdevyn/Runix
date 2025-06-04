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
  TextDocumentSyncKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseFeatureFile } from '../src/parser/parser';
import { DriverRegistry } from '../src/drivers/driverRegistry';
import { StepRegistry } from '../src/core/stepRegistry';
import { Logger } from '../src/utils/logger';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const logger = Logger.getInstance();

connection.onInitialize(async (_params: InitializeParams) => {
  // Initialize driver registry to get step definitions
  try {
    const driverRegistry = DriverRegistry.getInstance();
    await driverRegistry.initialize(); // This calls discoverDrivers internally
    
    const stepRegistry = StepRegistry.getInstance();
    await stepRegistry.initialize();
    
    // Get all drivers and register their steps - use correct method
    const driverIds = driverRegistry.listDriverIds();
    for (const driverId of driverIds) {
      const driver = driverRegistry.getDriver(driverId);
      if (driver) {
        // Mock step registration for LSP (without actually starting drivers)
        const mockSteps = [
          {
            id: `${driverId}-mock-1`,
            pattern: 'I open the browser at "(.*)"',
            action: 'open',
            description: `Open browser at URL (${driver.name})`
          },
          {
            id: `${driverId}-mock-2`, 
            pattern: 'I enter "(.*)" into the "(.*)" field',
            action: 'type',
            description: `Enter text into field (${driver.name})`
          }
        ];
        stepRegistry.registerSteps(driverId, mockSteps);
      }
    }
  } catch (error) {
    logger.error('Failed to initialize LSP driver registry:', { error: error instanceof Error ? error.message : String(error) });
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false }
    }
  };
});

// Validate .feature files
documents.onDidChangeContent((change) => {
  const doc = change.document;
  if (!doc.uri.endsWith('.feature')) return;
  const diagnostics: Diagnostic[] = [];
  try {
    parseFeatureFile(doc.uri.replace('file://', ''));
  } catch (err: any) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 }
      },
      message: err.message || String(err)
    });
  }
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
});

// Provide step suggestions
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  const completions: CompletionItem[] = [];
  
  try {
    const stepRegistry = StepRegistry.getInstance();
    const registeredDrivers = stepRegistry.getRegisteredDrivers();
    
    for (const driverId of registeredDrivers) {
      const steps = stepRegistry.getDriverSteps(driverId);
      for (const step of steps) {
        completions.push({
          label: step.pattern,
          kind: CompletionItemKind.Snippet,
          detail: step.description || step.pattern,
          documentation: `Action: ${step.action}\nDriver: ${driverId}`
          // Remove: examples: step.examples?.join('\n') || '',
        });
      }
    }
  } catch (error) {
    console.warn('Failed to get dynamic step completions:', error);
  }
  
  // Fallback to static completions
  if (completions.length === 0) {
    return [
      {
        label: 'Given I open the browser at "<url>"',
        kind: CompletionItemKind.Snippet
      },
      {
        label: 'When I enter "<value>" into the "<field>" field',
        kind: CompletionItemKind.Snippet
      },
      {
        label: 'Then I should see "<text>"',
        kind: CompletionItemKind.Snippet
      },
      {
        label: 'And I click the "<button>" button',
        kind: CompletionItemKind.Snippet
      }
    ];
  }
  
  return completions;
});

documents.listen(connection);
connection.listen();