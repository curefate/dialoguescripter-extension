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

// 初始化 C# 分析服务
const csharpService = new CSharpAnalysisService(
    path.join(__dirname, '../ds-service/DSService.exe')
);

connection.onInitialize((params: InitializeParams) => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental
        }
    };
});

// 核心分析逻辑
documents.onDidChangeContent(async (change) => {
    try {
        const diagnostics = await csharpService.analyze(change.document);
        connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
    } catch (error) {
        connection.console.error(`[DS] C# 分析错误: ${error}`);
    }
});

connection.listen();
documents.listen(connection);