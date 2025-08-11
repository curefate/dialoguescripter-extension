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
            env: { ...process.env, NODE_ENV: 'production' },
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

    async analyze(document: TextDocument): Promise<Diagnostic[]> {
        const code = document.getText();
        const request = {
            code: code,
        };

        this.connection.console.log(`Analyzing code (length: ${code.length})`);

        if (!request.code) {
            return [];
        }

        return new Promise((resolve, reject) => {
            const requestStr = JSON.stringify(request) + '\n';
            
            this.connection.console.log(`[DS] Sending request (${requestStr.length} bytes)`);

            this.process?.stdin?.write(requestStr, (err) => {
                if (err) {
                    this.connection.console.error(`[DS] Write error: ${err}`);
                    resolve([]);
                }
            });

            let responseData = '';
            this.process.stdout!.on('data', (data) => {
                responseData += data.toString();
                try {
                    const result = JSON.parse(responseData);
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
                    responseData = '';
                } catch {
                    // wait for more data
                }
            });
        });
    }
}