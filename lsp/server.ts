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

process.on('uncaughtException', (error) => {
    connection.console.error(`[DS Server] Server uncaught exception: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
    connection.console.error(`[DS Server] Server unhandled rejection: ${reason}`);
});

const csharpService = new CSharpAnalysisService(
    path.join(__dirname, '../../ds-service/DSService.exe'),
    connection
);

connection.onInitialize((params: InitializeParams) => {
    connection.console.log('[DS Server] Server initialized');
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental
        }
    };
});

documents.onDidChangeContent(async (change) => {
    connection.console.log(`[DS Server] document changed: ${change.document.uri}`);
    try {
        const diagnostics = await csharpService.analyze(change.document);
        connection.console.log(`[DS Server] recieve ${diagnostics.length} diagnostics`);
        connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
    } catch (error) {
        connection.console.error(`[DS Server] C# analyze error: ${error}`);
    }
});

connection.listen();
documents.listen(connection);