using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Antlr4.Runtime;

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
        Console.Error.WriteLine("[DS Service] C# process started");
        while (true)
        {
            try
            {
                var input = Console.ReadLine();
                if (string.IsNullOrEmpty(input))
                {
                    Console.WriteLine(JsonSerializer.Serialize(new AnalysisResult
                    {
                        Diagnostics = Array.Empty<Diagnostic>()
                    }));
                    continue;
                }

                Console.Error.WriteLine($"[DS Service] Received input: {input.Length} chars");
                var request = JsonSerializer.Deserialize<AnalysisRequest>(input);

                if (request?.Code == null)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new
                    {
                        Error = "[DS Service] Invalid request format: code cannot be null"
                    }));
                    continue;
                }

                if (request.Code.Length > 10_000)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new
                    {
                        Error = "[DS Service] Code length exceeds 10,000 characters limit"
                    }));
                    continue;
                }

                var result = AnalyzeCode(request.Code);
                Console.WriteLine(JsonSerializer.Serialize(result) + "\n");
            }
            catch (Exception ex)
            {
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    Error = $"[DS Service] Unexpected error: {ex.Message}"
                }));
            }
        }
    }

    static AnalysisResult AnalyzeCode(string code)
    {
        Console.Error.WriteLine($"[DS Service] Analyzing code (length: {code.Length})");

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