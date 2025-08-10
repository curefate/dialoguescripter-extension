import * as path from 'path';
import { workspace, ExtensionContext, window } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    State,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    // 服务器模块路径
    const serverModule = context.asAbsolutePath(
        path.join('out', 'lsp', 'server.js')
    );

    // 服务器选项
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };

    // 客户端选项
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'ds' }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/.ds')
        }
    };

    const outputChannel = window.createOutputChannel('DS Language Server');

    // 创建语言客户端并启动
    client = new LanguageClient(
        'dsLanguageServer',
        'DS Language Server',
        serverOptions,
        {
            documentSelector: [{ scheme: 'file', language: 'ds' }],
            outputChannel: window.createOutputChannel('DS Debug'),
            traceOutputChannel: window.createOutputChannel('DS Trace'),
            synchronize: {
                fileEvents: workspace.createFileSystemWatcher('**/.ds')
            }
        }
    );

    client.onDidChangeState(event => {
        if (event.newState === State.Stopped) {
            window.showErrorMessage('语言服务器意外停止');
        }
    });

    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}