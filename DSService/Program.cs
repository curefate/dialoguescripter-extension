using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Antlr4.Runtime;

// dotnet publish -c Release -r win-x64 --self-contained false /p:PublishSingleFile=true
// dotnet publish -c Release
// 定义通信协议
public class AnalysisRequest
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;
}

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
    static void Main(string[] args)
    {
        Console.Error.WriteLine("DS analyzer started");
        while (true)
        {
            try
            {
                var input = Console.ReadLine();
                if (string.IsNullOrEmpty(input))
                {
                    Console.Error.WriteLine("Warning: Received empty input");
                    Console.WriteLine(JsonSerializer.Serialize(new AnalysisResult
                    {
                        Diagnostics = Array.Empty<Diagnostic>()
                    }));
                    continue;
                }

                Console.Error.WriteLine($"Received input: {input.Length} chars");

                var request = JsonSerializer.Deserialize<AnalysisRequest>(input);
                if (request == null || request.Code == null)
                {
                    Console.Error.WriteLine("Error: Invalid request format");
                    Console.WriteLine(JsonSerializer.Serialize(new
                    {
                        Error = "Invalid request format: code cannot be null"
                    }));
                    continue;
                }

                var result = AnalyzeCode(request.Code);
                var json = JsonSerializer.Serialize(result);
                Console.WriteLine(json);
            }
            catch (JsonException jex)
            {
                Console.Error.WriteLine($"JSON error: {jex.Message}");
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    Error = $"Invalid JSON: {jex.Message}",
                    StackTrace = jex.StackTrace
                }));
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Unexpected error: {ex}");
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    Error = $"Unexpected error: {ex.Message}",
                    StackTrace = ex.StackTrace
                }));
            }
        }
    }

    static AnalysisResult AnalyzeCode(string code)
    {
        Console.Error.WriteLine($"Analyzing code (length: {code.Length})");

        var inputStream = new AntlrInputStream(code);
        var lexer = new DSLexer(inputStream);
        var tokens = new CommonTokenStream(lexer);

        // 打印所有token用于调试
        tokens.Fill();
        Console.Error.WriteLine($"Total tokens: {tokens.Size}");
        for (int i = 0; i < tokens.Size; i++)
        {
            var token = tokens.Get(i);
            Console.Error.WriteLine($"Token {i}: {token.Text} (Type: {token.Type}, Line: {token.Line}, Column: {token.Column})");
        }

        var parser = new DSParser(tokens);
        parser.RemoveErrorListeners();
        var errorListener = new DSErrorListener();
        parser.AddErrorListener(errorListener);

        var tree = parser.program(); // 获取解析树

        // 打印解析树结构
        Console.Error.WriteLine($"Parse tree: {tree.ToStringTree(parser)}");

        // 打印收集到的错误
        Console.Error.WriteLine($"Found {errorListener.Diagnostics.Count} errors");
        foreach (var error in errorListener.Diagnostics)
        {
            Console.Error.WriteLine($"Error at {error.Line}:{error.Column} - {error.Message}");
        }

        return new AnalysisResult
        {
            Diagnostics = errorListener.Diagnostics.ToArray()
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
        Console.Error.WriteLine($"Syntax error detected! Line: {line}, Pos: {charPositionInLine}, Msg: {msg}");

        Diagnostics.Add(new Diagnostic
        {
            Line = line - 1,  // 转换为0-based
            Column = charPositionInLine,
            Message = msg
        });
    }
}