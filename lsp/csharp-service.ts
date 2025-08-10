import { ChildProcess, spawn } from 'child_process';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, Connection } from 'vscode-languageserver';

export class CSharpAnalysisService {
    private process: ChildProcess;
    private connection: Connection;

    constructor(exePath: string, connection: Connection) {
        this.connection = connection;
        this.process = spawn(exePath, [], {
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

    async analyze(document: TextDocument): Promise<Diagnostic[]> {
        const request = {
            code: document.getText()
        };
        this.connection.console.log(`[DS] 发送分析请求: ${document.uri}`);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('C# 分析超时'));
            }, 5000);

            let responseData = '';
            this.process.stdout!.on('data', (data) => {
                responseData += data.toString();
                try {
                    const result = JSON.parse(responseData);
                    clearTimeout(timeout);
                    this.connection.console.log(`[DS] 解析到 ${result.Diagnostics?.length || 0} 个诊断`);
                    
                    if (result.Error) {
                        this.connection.console.error(`[DS] 分析错误: ${result.Error}`);
                        reject(new Error(result.Error));
                    } else {
                        resolve(result.Diagnostics.map((d: any) => ({
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
                } catch {
                    // JSON 不完整，等待更多数据
                }
            });

            this.process.stdin!.write(JSON.stringify(request) + '\n');
        });
    }
}