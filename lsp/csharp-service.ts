import { ChildProcess, spawn } from 'child_process';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, Connection } from 'vscode-languageserver';

export class CSharpAnalysisService {
    private process: ChildProcess | null = null;
    private restartAttempts = 0;
    private readonly maxRestartAttempts = 5;
    private activeRequests: Map<string, { resolve: (diags: Diagnostic[]) => void, reject: (err: Error) => void }> = new Map();
    private buffer = '';

    constructor(
        private readonly exePath: string,
        private readonly connection: Connection,
        private readonly restartDelayMs = 1000,
        private readonly requestTimeoutMs = 10000
    ) {
        this.spawnProcess();
    }

    private spawnProcess(): void {
        this.process = spawn(this.exePath, [], {
            stdio: ['pipe', 'pipe', 'inherit'],
            windowsVerbatimArguments: true,
            env: { ...process.env, NODE_ENV: 'production' },
            windowsHide: true
        });

        this.connection.console.log(`[DS] C# process started (PID: ${this.process.pid})`);

        this.process.stdout?.on('data', (data: Buffer) => {
            this.buffer += data.toString();
            const lines = this.buffer.split('\n');
            
            if (lines.length > 1) {
                this.buffer = lines.pop()!;
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    try {
                        const result = JSON.parse(line);
                        if (result.Error) {
                            this.connection.console.error(`[DS] Analysis error: ${result.Error}`);
                            this.clearRequests(new Error(result.Error));
                        } else {
                            this.resolveRequests(this.mapDiagnostics(result.Diagnostics));
                        }
                    } catch (err) {
                        this.connection.console.error(`[DS] JSON parse error: ${err}, data: ${line}`);
                    }
                }
            }
        });

        this.process.on('exit', (code) => {
            this.connection.console.error(`[DS] C# process exited, code: ${code}`);
            this.scheduleRestart();
        });

        this.process.on('error', (err) => {
            this.connection.console.error(`[DS] C# process error: ${err}`);
            this.scheduleRestart();
        });
    }

    private resolveRequests(diagnostics: Diagnostic[]): void {
        this.activeRequests.forEach(({ resolve }) => resolve(diagnostics));
        this.activeRequests.clear();
    }

    private clearRequests(error: Error): void {
        this.activeRequests.forEach(({ reject }) => reject(error));
        this.activeRequests.clear();
    }

    private scheduleRestart(): void {
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

    public async analyze(document: TextDocument): Promise<Diagnostic[]> {
        const requestId = Date.now().toString();
        const code = document.getText();

        if (!code) {
            return [];
        }

        return new Promise((resolve, reject) => {
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

            const requestStr = JSON.stringify({ code }) + '\n';
            const canWrite = this.process?.stdin?.write(requestStr, (err) => {
                if (err) {
                    this.activeRequests.delete(requestId);
                    reject(err);
                }
            });

            if (!canWrite) {
                this.process?.stdin?.once('drain', () => {
                    this.connection.console.log('[DS] stdin drained, resuming');
                });
            }
        });
    }

    private mapDiagnostics(diags: any[]): Diagnostic[] {
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
}