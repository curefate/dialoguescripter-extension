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

const ANALYSIS_DEBOUNCE_MS = 300;
let analysisTimeout: NodeJS.Timeout | null = null;

const csharpService = new CSharpAnalysisService(
    path.join(__dirname, '../../ds-service/DSService.exe'),
    connection,
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
    if (analysisTimeout) {
        clearTimeout(analysisTimeout);
    }

    analysisTimeout = setTimeout(async () => {
        try {
            connection.console.log(`[DS Server] Analyzing: ${change.document.uri}`);
            const diagnostics = await csharpService.analyze(change.document);
            connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
        } catch (error) {
            connection.console.error(`[DS Server] Analysis failed: ${error}`);
        }
    }, ANALYSIS_DEBOUNCE_MS);
});

connection.listen();
documents.listen(connection);