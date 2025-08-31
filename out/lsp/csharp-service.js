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
const vscode_languageserver_1 = require("vscode-languageserver");
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
        this.analyzeRequests = new Map();
        this.definitionRequests = new Map();
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
                            switch (result.Type) {
                                case 'AnalyzeResult':
                                    const diags = this.mapDiagnostics(result.Diagnostics || []);
                                    this.resolveAnalyzeRequests(diags);
                                    break;
                                case 'DefinitionResult':
                                    const positions = result.Positions;
                                    if (Array.isArray(positions) && positions.length > 0) {
                                        const pos = positions[0];
                                        const location = vscode_languageserver_1.Location.create(vscode_uri_1.URI.file(pos.FilePath).toString(), vscode_languageserver_1.Range.create(vscode_languageserver_1.Position.create(pos.StartLine, pos.StartColumn), vscode_languageserver_1.Position.create(pos.EndLine, pos.EndColumn)));
                                        this.resolveDefinitionRequests(location);
                                    }
                                    else {
                                        this.resolveDefinitionRequests(null);
                                    }
                                    break;
                                default:
                                    this.connection.console.error(`[DS] Unknown result type: ${result.Type}`);
                                    break;
                            }
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
    resolveAnalyzeRequests(diagnostics) {
        this.analyzeRequests.forEach(({ resolve }) => resolve(diagnostics));
        this.analyzeRequests.clear();
    }
    resolveDefinitionRequests(location) {
        this.definitionRequests.forEach(({ resolve }) => resolve(location));
        this.definitionRequests.clear();
    }
    clearRequests(error) {
        this.analyzeRequests.forEach(({ reject }) => reject(error));
        this.analyzeRequests.clear();
        this.definitionRequests.forEach(({ reject }) => reject(error));
        this.definitionRequests.clear();
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
                    this.analyzeRequests.delete(requestId);
                    reject(new Error('Analysis timeout'));
                }, this.requestTimeoutMs);
                this.analyzeRequests.set(requestId, {
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
                        this.analyzeRequests.delete(requestId);
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
            severity: d.Severity || 1
        }));
    }
    onUpdate(document) {
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
    onOpenFile(document) {
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
    onCloseFile(document) {
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
    getDefinition(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const requestId = Date.now().toString();
            return new Promise((resolve, reject) => {
                var _a, _b;
                const timeout = setTimeout(() => {
                    this.definitionRequests.delete(requestId);
                    reject(new Error('Definition timeout'));
                }, this.requestTimeoutMs);
                this.definitionRequests.set(requestId, {
                    resolve: (loc) => {
                        clearTimeout(timeout);
                        resolve(loc);
                    },
                    reject: (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    }
                });
                const filePath = vscode_uri_1.URI.parse(params.document.uri).fsPath;
                const payload = {
                    type: 'definition',
                    id: requestId,
                    filePath,
                    position: params.position
                };
                (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.write(JSON.stringify(payload) + '\n', (err) => {
                    if (err) {
                        this.definitionRequests.delete(requestId);
                        reject(err);
                    }
                });
            });
        });
    }
}
exports.CSharpAnalysisService = CSharpAnalysisService;
//# sourceMappingURL=csharp-service.js.map