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
    constructor(exePath) {
        this.process = (0, child_process_1.spawn)(exePath, [], {
            stdio: ['pipe', 'pipe', 'inherit']
        });
    }
    analyze(document) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = {
                code: document.getText()
            };
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('C# analysis timed out'));
                }, 5000);
                this.process.stdout.once('data', (data) => {
                    clearTimeout(timeout);
                    try {
                        const result = JSON.parse(data.toString());
                        if (result.Error) {
                            reject(new Error(result.Error));
                        }
                        else {
                            resolve(result.Diagnostics.map((d) => ({
                                range: {
                                    start: { line: d.Line, character: d.Column },
                                    end: { line: d.Line, character: d.Column + 1 }
                                },
                                message: d.Message,
                                source: 'ds'
                            })));
                        }
                    }
                    catch (e) {
                        reject(e);
                    }
                });
                this.process.stdin.write(JSON.stringify(request) + '\n');
            });
        });
    }
}
exports.CSharpAnalysisService = CSharpAnalysisService;
//# sourceMappingURL=csharp-service.js.map