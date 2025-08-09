import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    // 服务器模块路径
    const serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
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
    
    // 创建语言客户端并启动
    client = new LanguageClient(
        'dsLanguageServer',
        'DS Language Server',
        serverOptions,
        clientOptions
    );
    
    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}