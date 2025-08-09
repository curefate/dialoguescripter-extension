import { ChildProcess, spawn } from 'child_process';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver';

export class CSharpAnalysisService {
    private process: ChildProcess;

    constructor(exePath: string) {
        this.process = spawn(exePath, [], {
            stdio: ['pipe', 'pipe', 'inherit']
        });
    }

    async analyze(document: TextDocument): Promise<Diagnostic[]> {
        const request = {
            code: document.getText()
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('C# analysis timed out'));
            }, 5000);

            this.process.stdout!.once('data', (data) => {
                clearTimeout(timeout);
                try {
                    const result = JSON.parse(data.toString());
                    if (result.Error) {
                        reject(new Error(result.Error));
                    } else {
                        resolve(result.Diagnostics.map((d: any) => ({
                            range: {
                                start: { line: d.Line, character: d.Column },
                                end: { line: d.Line, character: d.Column + 1 }
                            },
                            message: d.Message,
                            source: 'ds'
                        })));
                    }
                } catch (e) {
                    reject(e);
                }
            });

            this.process.stdin!.write(JSON.stringify(request) + '\n');
        });
    }
}