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
            env: Object.assign(Object.assign({}, process.env), { NODE_ENV: 'production' }),
            windowsHide: true
        });
        this.process.on('error', (err) => {
            this.connection.console.error(`[DS] C# process error: ${err}`);
        });
        this.process.on('exit', (code) => {
            this.connection.console.error(`[DS] C# process exit, code: ${code}`);
        });
        this.process.on('close', (code) => {
            this.connection.console.error(`[DS] C# process closed, code: ${code}`);
        });
    }
    analyze(document) {
        return __awaiter(this, void 0, void 0, function* () {
            const code = document.getText();
            const request = {
                code: code,
            };
            this.connection.console.log(`Analyzing code (length: ${code.length})`);
            if (!request.code) {
                return [];
            }
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
                let responseData = '';
                this.process.stdout.on('data', (data) => {
                    responseData += data.toString();
                    try {
                        const result = JSON.parse(responseData);
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
                        responseData = '';
                    }
                    catch (_a) {
                        // wait for more data
                    }
                });
            });
        });
    }
}
exports.CSharpAnalysisService = CSharpAnalysisService;
//# sourceMappingURL=csharp-service.js.map