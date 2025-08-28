using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Antlr4.Runtime;
using Antlr4.Runtime.Misc;
using Antlr4.Runtime.Tree;

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
                            Console.Error.WriteLine($"[DS C#] Opened file: {filePath}");
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

                                // TODO range patch
                                text = changes.GetString() ?? text;
                                _fileCache[filePath] = text;
                            }
                            Console.Error.WriteLine($"[DS C#] Updated file: {filePath}");
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

                            var result = AnalyzeCode(code, filePath);
                            Console.WriteLine(JsonSerializer.Serialize(result));
                            break;
                        }
                    case "define":
                        {
                            // TODO 发送跳转请求给lsp
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

    static AnalysisResult AnalyzeCode(string code, string filePath)
    {
        var inputStream = new AntlrInputStream(code);
        var lexer = new DSLexer(inputStream);
        var tokens = new CommonTokenStream(lexer);
        var parser = new DSParser(tokens);
        parser.RemoveErrorListeners();
        var errorListener = new DSErrorListener();
        parser.AddErrorListener(errorListener);
        var tree = parser.program();
        var diagList = new List<Diagnostic>(errorListener.Diagnostics);

        /*
        核心思想：
            先导入
            检查jump和tour的label是否存在。需要visitor中处理
            检查使用的变量是否存在定义。需要visitor中处理assign语句和variable
            Visior中只收集，不对比
            全收集，然后在这里对比
        */

        return new AnalysisResult
        {
            Diagnostics = [.. diagList]
        };
    }
}

internal class DSErrorListener : BaseErrorListener
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

internal class VisitorChecker : DSParserBaseVisitor<object>
{
    public HashSet<string> DefinedLabels = [];
    public Dictionary<string, (int, int)> DefinedLabelPositions = [];
    public HashSet<string> ReferencedLabels = [];
    public Dictionary<string, List<(int, int)>> ReferencedLabelPositions = [];
    public HashSet<string> DefinedVariables = [];
    public Dictionary<string, (int, int)> DefinedVariablePositions = [];
    public HashSet<string> ReferencedVariables = [];
    public Dictionary<string, List<(int, int)>> ReferencedVariablePositions = [];
    private string _currentLabel = string.Empty;

    public override object Visit(IParseTree tree)
    {
        DefinedLabels.Clear();
        ReferencedLabels.Clear();
        DefinedVariables.Clear();
        ReferencedVariables.Clear();
        return null;
    }

    public override object VisitLabel_block([NotNull] DSParser.Label_blockContext context)
    {
        var label = context.label.Text;
        DefinedLabels.Add(label);
        DefinedLabelPositions[label] = (context.Start.Line - 1, context.label.Column);
        _currentLabel = label;
        return null;
    }

    public override object VisitJump_stmt([NotNull] DSParser.Jump_stmtContext context)
    {
        var label = context.label.Text;
        ReferencedLabels.Add(label);
        ReferencedLabelPositions.TryAdd(label, []);
        ReferencedLabelPositions[label].Add((context.Start.Line - 1, context.label.Column));
        return null;
    }

    public override object VisitTour_stmt([NotNull] DSParser.Tour_stmtContext context)
    {
        ReferencedLabels.Add(context.label.Text);
        ReferencedLabelPositions.TryAdd(context.label.Text, []);
        ReferencedLabelPositions[context.label.Text].Add((context.Start.Line - 1, context.label.Column));
        return null;
    }

    // TODO
}