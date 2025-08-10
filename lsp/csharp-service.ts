import { ChildProcess, spawn } from 'child_process';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, Connection } from 'vscode-languageserver';

export class CSharpAnalysisService {
    private process: ChildProcess;
    private connection: Connection;

    constructor(exePath: string, connection: Connection) {
        this.connection = connection;
        this.process = spawn(exePath, [], {
            stdio: ['pipe', 'pipe', 'inherit'],
            windowsVerbatimArguments: true,
            env: { ...process.env, NODE_ENV: 'production' }
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

    async analyze(document: TextDocument): Promise<Diagnostic[]> {
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
            const requestStr = JSON.stringify(request) + '\n';
            this.connection.console.log(`[DS] Sending request (${requestStr.length} bytes)`);

            this.process?.stdin?.write(requestStr, (err) => {
                if (err) {
                    this.connection.console.error(`[DS] Write error: ${err}`);
                    resolve([]);
                }
            });
            const timeout = setTimeout(() => {
                reject(new Error('C# analysis request timed out'));
            }, 5000);

            let responseData = '';
            this.process.stdout!.on('data', (data) => {
                responseData += data.toString();
                try {
                    const result = JSON.parse(responseData);
                    clearTimeout(timeout);
                    this.connection.console.log(`[DS] parse ${result.Diagnostics?.length || 0} diagnostics`);

                    if (result.Error) {
                        this.connection.console.error(`[DS] analysis error: ${result.Error}`);
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
                            message: d.Message || 'unknown error',
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