using System;
using System.IO;
using System.Text.Json;
using Antlr4.Runtime;

// dotnet publish -c Release -r win-x64 --self-contained true
// 定义通信协议
public class AnalysisRequest
{
    public string Code { get; set; }
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
        while (true)
        {
            var input = Console.ReadLine();
            if (string.IsNullOrEmpty(input)) continue;

            try
            {
                var request = JsonSerializer.Deserialize<AnalysisRequest>(input);
                var result = AnalyzeCode(request.Code);
                Console.WriteLine(JsonSerializer.Serialize(result));
            }
            catch (Exception ex)
            {
                Console.WriteLine(JsonSerializer.Serialize(new
                {
                    Error = ex.Message
                }));
            }
        }
    }

    static AnalysisResult AnalyzeCode(string code)
    {
        var inputStream = new AntlrInputStream(code);
        var lexer = new DSLexer(inputStream);
        var tokens = new CommonTokenStream(lexer);
        var parser = new DSParser(tokens);

        // 1. 收集语法错误
        parser.RemoveErrorListeners();
        var errorListener = new DSErrorListener();
        parser.AddErrorListener(errorListener);
        parser.program();

        // 2. 返回结构化结果
        return new AnalysisResult
        {
            Diagnostics = errorListener.Diagnostics.ToArray()
        };
    }
}

class DSErrorListener : BaseErrorListener
{
    public List<Diagnostic> Diagnostics { get; } = new List<Diagnostic>();

    public override void SyntaxError(TextWriter output, IRecognizer recognizer, IToken offendingSymbol, int line, int charPositionInLine, string msg, RecognitionException e)
    {
        base.SyntaxError(output, recognizer, offendingSymbol, line, charPositionInLine, msg, e);
        Diagnostics.Add(new Diagnostic
        {
            Line = line - 1,
            Column = charPositionInLine,
            Message = msg
        });
    }
}