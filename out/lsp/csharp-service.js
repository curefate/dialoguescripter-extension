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
class CSharpAnalysisService {
    constructor(exePath, connection) {
        this.connection = connection;
        this.process = (0, child_process_1.spawn)(exePath, [], {
            stdio: ['pipe', 'pipe', 'inherit'],
            windowsVerbatimArguments: true,
            env: Object.assign(Object.assign({}, process.env), { NODE_ENV: 'production' })
        });
        this.process.on('error', (err) => {
            this.connection.console.error(`[DS] C# process error: ${err}`);
        });
        this.process.on('exit', (code) => {
            this.connection.console.error(`[DS] C# process exit, code: ${code}`);
        });
        this.process.on('close', (code) => {
            this.connection.console.error(`[DS] C# process cosed, code: ${code}`);
        });
    }
    analyze(document) {
        return __awaiter(this, void 0, void 0, function* () {
            const code = document.getText();
            this.connection.console.log(`[DS] Full code content (${code.length} chars):\n${code}`);
            const request = {
                code: code,
                uri: document.uri
            };
            if (!request.code) {
                this.connection.console.log('[DS] document is empty');
                return [];
            }
            this.connection.console.log(`[DS] Analyzing document (length: ${request.code.length})`);
            this.connection.console.log(`[DS] First 50 chars: ${request.code.substring(0, Math.min(50, request.code.length))}`);
            this.connection.console.log(`[DS] send analyze request: ${document.uri}`);
            return new Promise((resolve, reject) => {
                var _a, _b;
                const requestStr = JSON.stringify(request) + '\n';
                this.connection.console.log(`[DS] Sending request (${requestStr.length} bytes)`);
                (_b = (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.write(requestStr, (err) => {
                    if (err) {
                        this.connection.console.error(`[DS] Write error: ${err}`);
                        resolve([]);
                    }
                });
                const timeout = setTimeout(() => {
                    reject(new Error('C# analysis request timed out'));
                }, 5000);
                let responseData = '';
                this.process.stdout.on('data', (data) => {
                    var _a;
                    responseData += data.toString();
                    try {
                        const result = JSON.parse(responseData);
                        clearTimeout(timeout);
                        this.connection.console.log(`[DS] parse ${((_a = result.Diagnostics) === null || _a === void 0 ? void 0 : _a.length) || 0} diagnostics`);
                        if (result.Error) {
                            this.connection.console.error(`[DS] analysis error: ${result.Error}`);
                            reject(new Error(result.Error));
                        }
                        else {
                            resolve(result.Diagnostics.map((d) => ({
                                range: {
                                    start: {
                                        line: d.Line >= 0 ? d.Line : 0,
                                        character: d.Column >= 0 ? d.Column : 0
                                    },
                                    end: {
                                        line: d.Line >= 0 ? d.Line : 0,
                                        character: Math.max(d.Column >= 0 ? d.Column : 0, 0) + 1
                                    }
                                },
                                message: d.Message || 'unknown error',
                                source: 'ds',
                                severity: 1
                            })));
                        }
                        responseData = ''; // 重置为下次请求准备
                    }
                    catch (_b) {
                        // JSON 不完整，等待更多数据
                    }
                });
                this.process.stdin.write(JSON.stringify(request) + '\n');
            });
        });
    }
}
exports.CSharpAnalysisService = CSharpAnalysisService;
//# sourceMappingURL=csharp-service.js.map