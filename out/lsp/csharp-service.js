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
exports.CSharpAnalysisService = void 0;
const child_process_1 = require("child_process");
const vscode_uri_1 = require("vscode-uri");
class CSharpAnalysisService {
    constructor(exePath, connection, documents, restartDelayMs = 1000, requestTimeoutMs = 10000) {
        this.exePath = exePath;
        this.connection = connection;
        this.documents = documents;
        this.restartDelayMs = restartDelayMs;
        this.requestTimeoutMs = requestTimeoutMs;
        this.process = null;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 5;
        this.activeRequests = new Map();
        this.buffer = '';
        this.spawnProcess();
    }
    spawnProcess() {
        var _a;
        this.process = (0, child_process_1.spawn)(this.exePath, [], {
            stdio: ['pipe', 'pipe', 'inherit'],
            windowsVerbatimArguments: true,
            env: Object.assign(Object.assign({}, process.env), { NODE_ENV: 'production' }),
            windowsHide: true
        });
        this.connection.console.log(`[DS] C# process started (PID: ${this.process.pid})`);
        (_a = this.process.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
            this.buffer += data.toString();
            const lines = this.buffer.split('\n');
            if (lines.length > 1) {
                this.buffer = lines.pop();
                for (const line of lines) {
                    if (line.trim() === '')
                        continue;
                    try {
                        const result = JSON.parse(line);
                        if (result.Error) {
                            this.connection.console.error(`[DS] Analysis error: ${result.Error}`);
                            this.clearRequests(new Error(result.Error));
                        }
                        else {
                            this.resolveRequests(this.mapDiagnostics(result.Diagnostics));
                        }
                    }
                    catch (err) {
                        this.connection.console.error(`[DS] JSON parse error: ${err}, data: ${line}`);
                    }
                }
            }
        });
        this.process.on('exit', (err) => {
            this.connection.console.error(`[DS] C# process exited, error: ${err}`);
            this.scheduleRestart();
        });
        this.process.on('error', (err) => {
            this.connection.console.error(`[DS] C# process error: ${err}`);
            this.scheduleRestart();
        });
    }
    resolveRequests(diagnostics) {
        this.activeRequests.forEach(({ resolve }) => resolve(diagnostics));
        this.activeRequests.clear();
    }
    clearRequests(error) {
        this.activeRequests.forEach(({ reject }) => reject(error));
        this.activeRequests.clear();
    }
    scheduleRestart() {
        if (this.restartAttempts >= this.maxRestartAttempts) {
            this.connection.console.error('[DS] Max restart attempts reached. Giving up.');
            this.clearRequests(new Error('C# process unavailable'));
            return;
        }
        this.restartAttempts++;
        setTimeout(() => {
            this.connection.console.log(`[DS] Restarting C# process (attempt ${this.restartAttempts})`);
            this.spawnProcess();
        }, this.restartDelayMs);
    }
    analyze(document) {
        return __awaiter(this, void 0, void 0, function* () {
            const requestId = Date.now().toString();
            return new Promise((resolve, reject) => {
                var _a, _b;
                const timeout = setTimeout(() => {
                    this.activeRequests.delete(requestId);
                    reject(new Error('Analysis timeout'));
                }, this.requestTimeoutMs);
                this.activeRequests.set(requestId, {
                    resolve: (diags) => {
                        clearTimeout(timeout);
                        resolve(diags);
                    },
                    reject: (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    }
                });
                const filePath = vscode_uri_1.URI.parse(document.uri).fsPath;
                const payload = {
                    type: 'analyze',
                    id: requestId,
                    filePath,
                };
                (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.write(JSON.stringify(payload) + '\n', (err) => {
                    if (err) {
                        this.activeRequests.delete(requestId);
                        reject(err);
                    }
                });
            });
        });
    }
    mapDiagnostics(diags) {
        return diags.map(d => ({
            range: {
                start: { line: d.Line >= 0 ? d.Line : 0, character: d.Column >= 0 ? d.Column : 0 },
                end: { line: d.Line >= 0 ? d.Line : 0, character: Math.max(d.Column >= 0 ? d.Column : 0, 0) + 1 }
            },
            message: d.Message || 'unknown error',
            source: 'ds',
            severity: 1
        }));
    }
    sendUpdate(document) {
        var _a, _b;
        const filePath = vscode_uri_1.URI.parse(document.uri).fsPath;
        const payload = {
            type: 'update',
            filePath,
            changes: document.getText(),
        };
        (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.write(JSON.stringify(payload) + '\n', (err) => {
            if (err) {
                this.connection.console.error(`[DS] Failed to send incremental update: ${err}`);
            }
        });
    }
    sendOpenFile(document) {
        var _a, _b;
        const filePath = vscode_uri_1.URI.parse(document.uri).fsPath;
        const payload = {
            type: 'openFile',
            filePath,
            content: document.getText(),
        };
        (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.write(JSON.stringify(payload) + '\n', (err) => {
            if (err) {
                this.connection.console.error(`[DS] Failed to send open file: ${err}`);
            }
        });
    }
    sendCloseFile(document) {
        var _a, _b;
        const filePath = vscode_uri_1.URI.parse(document.uri).fsPath;
        const payload = {
            type: 'closeFile',
            filePath,
        };
        (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.write(JSON.stringify(payload) + '\n', (err) => {
            if (err) {
                this.connection.console.error(`[DS] Failed to send close file: ${err}`);
            }
        });
    }
}
exports.CSharpAnalysisService = CSharpAnalysisService;
//# sourceMappingURL=csharp-service.js.map