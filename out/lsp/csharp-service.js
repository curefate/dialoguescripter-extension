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
            stdio: ['pipe', 'pipe', 'inherit']
        });
        this.process.on('error', (err) => {
            this.connection.console.error(`[DS] C# 进程错误: ${err}`);
        });
        this.process.on('exit', (code) => {
            this.connection.console.error(`[DS] C# 进程退出，代码 ${code}`);
        });
        this.process.on('close', (code) => {
            this.connection.console.error(`[DS] C# 进程关闭，代码 ${code}`);
        });
    }
    analyze(document) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = {
                code: document.getText()
            };
            this.connection.console.log(`[DS] 发送分析请求: ${document.uri}`);
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('C# 分析超时'));
                }, 5000);
                let responseData = '';
                this.process.stdout.on('data', (data) => {
                    var _a;
                    responseData += data.toString();
                    try {
                        const result = JSON.parse(responseData);
                        clearTimeout(timeout);
                        this.connection.console.log(`[DS] 解析到 ${((_a = result.Diagnostics) === null || _a === void 0 ? void 0 : _a.length) || 0} 个诊断`);
                        if (result.Error) {
                            this.connection.console.error(`[DS] 分析错误: ${result.Error}`);
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
                                message: d.Message || '未知错误',
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