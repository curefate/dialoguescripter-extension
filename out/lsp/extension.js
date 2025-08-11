"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const path = require("path");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    const serverModulePath = context.asAbsolutePath(path.join('out', 'lsp', 'server.js'));
    const serverOptions = {
        run: { module: serverModulePath, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModulePath,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };
    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'ds' }],
        synchronize: {
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/.ds')
        }
    };
    client = new node_1.LanguageClient('dsLanguageServer', 'DS Language Server', serverOptions, clientOptions);
    client.onDidChangeState(event => {
        if (event.newState === node_1.State.Stopped) {
            vscode_1.window.showErrorMessage('[DS] Language Server stopped unexpectedly.');
        }
    });
    client.start();
}
exports.activate = activate;
function deactivate() {
    return client ? client.stop() : undefined;
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map