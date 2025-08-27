using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Antlr4.Runtime;

public class AnalysisResult
{
    public Diagnostic[] Diagnostics { get; set; }
}

public class Diagnostic
{
    public int Line { get; set; }
    public int Column { get; set; }
    public string Message { get; set; }
}

class Program
{
    static readonly Dictionary<string, string> _fileCache = [];

    static void Main(string[] args)
    {
        Console.Error.WriteLine("[DS C#] C# process started");
        string input;
        while (!string.IsNullOrEmpty(input = Console.ReadLine()))
        {
            try
            {
                using var doc = JsonDocument.Parse(input);
                var root = doc.RootElement;
                var type = root.GetProperty("type").GetString();

                switch (type)
                {
                    case "openFile":
                        {
                            var filePath = root.GetProperty("filePath").GetString();
                            var content = root.GetProperty("content").GetString();
                            if (filePath != null) _fileCache[filePath] = content ?? "";
                            Console.Error.WriteLine($"[DS C#] Opened file: {filePath}, content length: {content?.Length}");
                            break;
                        }
                    case "update":
                        {
                            var filePath = root.GetProperty("filePath").GetString();
                            var changes = root.GetProperty("changes");
                            if (filePath != null)
                            {
                                if (!_fileCache.TryGetValue(filePath, out var text))
                                    text = File.Exists(filePath) ? File.ReadAllText(filePath) : string.Empty;

                                // ⚠️ 简化：这里直接全量替换为最后一个 change.text
                                // TODO: 应用真正的 range patch
                                text = changes.GetString() ?? text;

                                _fileCache[filePath] = text;
                            }
                            Console.Error.WriteLine($"[DS C#] Updated file: {filePath}, new content length: {_fileCache[filePath]?.Length}");
                            break;
                        }
                    case "closeFile":
                        {
                            var filePath = root.GetProperty("filePath").GetString();
                            if (filePath != null) _fileCache.Remove(filePath);
                            Console.Error.WriteLine($"[DS C#] Closed file: {filePath}");
                            break;
                        }
                    case "analyze":
                        {
                            var id = root.GetProperty("id").GetString();
                            var filePath = root.GetProperty("filePath").GetString();

                            if (filePath == null) break;

                            if (!_fileCache.TryGetValue(filePath, out var code))
                                code = File.Exists(filePath) ? File.ReadAllText(filePath) : string.Empty;

                            Console.Error.WriteLine($"[DS C#] Analyzing file: {filePath}");

                            var result = AnalyzeCode(code);
                            Console.WriteLine(JsonSerializer.Serialize(result));
                            break;
                        }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    Error = $"[DS C#] Unexpected error: {ex.Message}"
                }));
            }
        }
    }

    static AnalysisResult AnalyzeCode(string code)
    {
        Console.Error.WriteLine($"[DS C#] Analyzing code (length: {code.Length})");

        var inputStream = new AntlrInputStream(code);
        var lexer = new DSLexer(inputStream);
        var tokens = new CommonTokenStream(lexer);

        var parser = new DSParser(tokens);
        parser.RemoveErrorListeners();
        var errorListener = new DSErrorListener();
        parser.AddErrorListener(errorListener);

        parser.program();

        return new AnalysisResult
        {
            Diagnostics = [.. errorListener.Diagnostics]
        };
    }
}

class DSErrorListener : BaseErrorListener
{
    public List<Diagnostic> Diagnostics { get; } = new List<Diagnostic>();

    public override void SyntaxError(TextWriter output, IRecognizer recognizer,
        IToken offendingSymbol, int line, int charPositionInLine,
        string msg, RecognitionException e)
    {
        Diagnostics.Add(new Diagnostic
        {
            Line = line - 1,
            Column = charPositionInLine,
            Message = msg
        });
    }
}