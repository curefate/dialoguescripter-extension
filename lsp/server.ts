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

// 添加未捕获异常处理
process.on('uncaughtException', (error) => {
    connection.console.error(`[Server] 未捕获异常: ${error.stack}`);
});

// 添加未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
    connection.console.error(`[Server] 未处理的拒绝: ${reason}`);
});

// 初始化 C# 分析服务
const csharpService = new CSharpAnalysisService(
    path.join(__dirname, '../../ds-service/DSService.exe'),
    connection
);

connection.onInitialize((params: InitializeParams) => {
    connection.console.log('服务器初始化成功');
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental
        }
    };
});

// 核心分析逻辑
documents.onDidChangeContent(async (change) => {
    connection.console.log(`[DS] 文档变更: ${change.document.uri}`);
    try {
        const diagnostics = await csharpService.analyze(change.document);
        connection.console.log(`[DS] 收到 ${diagnostics.length} 个诊断信息`);
        connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
    } catch (error) {
        connection.console.error(`[DS] C# 分析错误: ${error}`);
    }
});

connection.listen();
documents.listen(connection);