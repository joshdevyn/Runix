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

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
connection.onInitialize((_params: InitializeParams) => {
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
  // Use known steps from the engine or other metadata
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
});

documents.listen(connection);
connection.listen();