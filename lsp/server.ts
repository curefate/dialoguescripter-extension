import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    Diagnostic,
    Location,
    Range,
    Position
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CSharpAnalysisService } from './csharp-service';
import * as path from 'path';
import { URI } from 'vscode-uri';

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
            textDocumentSync: TextDocumentSyncKind.Incremental,
            definitionProvider: true,
        }
    };
});

/* connection.onDefinition(async (params) => {
    const uri = params.textDocument.uri;
    const doc = documents.get(uri);
    if (!doc) return null;

    const filePath = URI.parse(uri).fsPath;

    const res = await csharpService.getDefinition({
        filePath,
        position: params.position
    });

    if (!res || !res.start || !res.end || !res.filePath) return null;

    const targetUri = URI.file(res.filePath).toString();
    return Location.create(
        targetUri,
        Range.create(
            Position.create(res.start.line, res.start.character),
            Position.create(res.end.line, res.end.character)
        )
    );
}); */

documents.onDidChangeContent((change) => {
    csharpService.onUpdate(change.document);

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
    csharpService.onOpenFile(event.document);
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

documents.onDidClose((event) => {
    connection.console.log(`[DS Server] Document closed: ${event.document.uri}`);
    csharpService.onCloseFile(event.document);
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