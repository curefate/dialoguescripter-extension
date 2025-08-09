"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const path = require("path");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    // 服务器模块路径
    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
    // 服务器选项
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };
    // 客户端选项
    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'ds' }],
        synchronize: {
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/.ds')
        }
    };
    // 创建语言客户端并启动
    client = new node_1.LanguageClient('dsLanguageServer', 'DS Language Server', serverOptions, clientOptions);
    client.start();
}
exports.activate = activate;
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map