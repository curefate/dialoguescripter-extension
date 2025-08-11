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
process.on('uncaughtException', (error) => {
    connection.console.error(`[DS Server] Server uncaught exception: ${error.stack}`);
});
process.on('unhandledRejection', (reason, promise) => {
    connection.console.error(`[DS Server] Server unhandled rejection: ${reason}`);
});
const csharpService = new csharp_service_1.CSharpAnalysisService(path.join(__dirname, '../../ds-service/DSService.exe'), connection);
connection.onInitialize((params) => {
    connection.console.log('[DS Server] Server initialized');
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental
        }
    };
});
documents.onDidChangeContent((change) => __awaiter(void 0, void 0, void 0, function* () {
    connection.console.log(`[DS Server] document changed: ${change.document.uri}`);
    try {
        const diagnostics = yield csharpService.analyze(change.document);
        connection.console.log(`[DS Server] recieve ${diagnostics.length} diagnostics`);
        connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
    }
    catch (error) {
        connection.console.error(`[DS Server] C# analyze error: ${error}`);
    }
}));
connection.listen();
documents.listen(connection);
//# sourceMappingURL=server.js.map