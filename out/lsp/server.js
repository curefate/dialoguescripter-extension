"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const csharp_service_1 = require("./csharp-service");
const path = require("path");
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
const ANALYSIS_DEBOUNCE_MS = 500;
let timer = null;
const csharpService = new csharp_service_1.CSharpAnalysisService(path.join(__dirname, '../../ds-service/DSService.exe'), connection, documents, 1000, // restartDelayMs
10000 // requestTimeoutMs
);
connection.onInitialize((params) => {
    connection.console.log('[DS Server] Server initialized');
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
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
    timer = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            connection.console.log(`[DS Server] Analyzing: ${change.document.uri}`);
            const diagnostics = yield csharpService.analyze(change.document);
            connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
        }
        catch (error) {
            connection.console.error(`[DS Server] Analysis failed: ${error}`);
        }
    }), ANALYSIS_DEBOUNCE_MS);
});
documents.onDidOpen((event) => {
    connection.console.log(`[DS Server] Document opened: ${event.document.uri}`);
    csharpService.onOpenFile(event.document);
    timer = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            connection.console.log(`[DS Server] Analyzing: ${event.document.uri}`);
            const diagnostics = yield csharpService.analyze(event.document);
            connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
        }
        catch (error) {
            connection.console.error(`[DS Server] Analysis failed: ${error}`);
        }
    }), 1);
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
    timer = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            connection.console.log(`[DS Server] Analyzing: ${event.document.uri}`);
            const diagnostics = yield csharpService.analyze(event.document);
            connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
        }
        catch (error) {
            connection.console.error(`[DS Server] Analysis failed: ${error}`);
        }
    }), 1);
});
connection.listen();
documents.listen(connection);
//# sourceMappingURL=server.js.map