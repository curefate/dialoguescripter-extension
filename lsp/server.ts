import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    Diagnostic
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CSharpAnalysisService } from './csharp-service';
import * as path from 'path';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const ANALYSIS_DEBOUNCE_MS = 500;
let timer: NodeJS.Timeout | null = null;

const csharpService = new CSharpAnalysisService(
    path.join(__dirname, '../../ds-service/DSService.exe'),
    connection,
    documents,
    1000, // restartDelayMs
    10000 // requestTimeoutMs
);

connection.onInitialize((params: InitializeParams) => {
    connection.console.log('[DS Server] Server initialized');
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental
        }
    };
});

documents.onDidChangeContent((change) => {
    csharpService.sendUpdate(change.document);

    if (timer) {
        clearTimeout(timer);
    }
    timer = setTimeout(async () => {
        try {
            connection.console.log(`[DS Server] Analyzing: ${change.document.uri}`);
            const diagnostics = await csharpService.analyze(change.document);
            connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
        } catch (error) {
            connection.console.error(`[DS Server] Analysis failed: ${error}`);
        }
    }, ANALYSIS_DEBOUNCE_MS);
});

documents.onDidOpen((event) => {
    connection.console.log(`[DS Server] Document opened: ${event.document.uri}`);
    csharpService.sendOpenFile(event.document);
});

documents.onDidClose((event) => {
    connection.console.log(`[DS Server] Document closed: ${event.document.uri}`);
    csharpService.sendCloseFile(event.document);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }); // Clear diagnostics
});

documents.onDidSave((event) => {
    connection.console.log(`[DS Server] Document saved: ${event.document.uri}`);
    if (timer) {
        clearTimeout(timer);
    }
    timer = setTimeout(async () => {
        try {
            connection.console.log(`[DS Server] Analyzing: ${event.document.uri}`);
            const diagnostics = await csharpService.analyze(event.document);
            connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
        } catch (error) {
            connection.console.error(`[DS Server] Analysis failed: ${error}`);
        }
    }, 1);
});

connection.listen();
documents.listen(connection);