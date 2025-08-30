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
                            // Console.Error.WriteLine($"[DS C#] Opened file: {filePath}");
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
                            // Console.Error.WriteLine($"[DS C#] Updated file: {filePath}");
                            break;
                        }
                    case "closeFile":
                        {
                            var filePath = root.GetProperty("filePath").GetString();
                            if (filePath != null) _fileCache.Remove(filePath);
                            // Console.Error.WriteLine($"[DS C#] Closed file: {filePath}");
                            break;
                        }
                    case "analyze":
                        {
                            var id = root.GetProperty("id").GetString();
                            var filePath = root.GetProperty("filePath").GetString();

                            if (filePath == null) break;

                            if (!_fileCache.TryGetValue(filePath, out var code))
                                code = File.Exists(filePath) ? File.ReadAllText(filePath) : string.Empty;

                            Console.Error.WriteLine($"[DS C#] Analyzing file: {filePath}({code.Length} chars)");

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

        var visitor = new VisitorChecker();
        visitor.Visit(tree);
        foreach (var label in visitor.ReferencedLabels)
        {
            if (!visitor.DefinedLabels.Contains(label))
            {
                foreach (var pos in visitor.ReferencedLabelPositions[label])
                {
                    diagList.Add(new Diagnostic
                    {
                        Line = pos.Item1,
                        Column = pos.Item2,
                        Message = $"Label '{label}' not found."
                    });
                }
            }
        }
        foreach (var variable in visitor.ReferencedVariables)
        {
            if (!visitor.DefinedVariables.Contains(variable))
            {
                foreach (var pos in visitor.ReferencedVariablePositions[variable])
                {
                    diagList.Add(new Diagnostic
                    {
                        Line = pos.Item1,
                        Column = pos.Item2,
                        Message = $"Variable '{variable}' not found."
                    });
                }
            }
        }

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
        DefinedLabelPositions.Clear();
        ReferencedLabels.Clear();
        ReferencedLabelPositions.Clear();
        DefinedVariables.Clear();
        DefinedVariablePositions.Clear();
        ReferencedVariables.Clear();
        ReferencedVariablePositions.Clear();
        _currentLabel = string.Empty;
        return base.Visit(tree);
    }

    public override object VisitLabel_block([NotNull] DSParser.Label_blockContext context)
    {
        var label = context.label.Text;
        DefinedLabels.Add(label);
        DefinedLabelPositions[label] = (context.Start.Line - 1, context.label.Column);
        _currentLabel = label;
        return base.VisitLabel_block(context);
    }

    public override object VisitJump_stmt([NotNull] DSParser.Jump_stmtContext context)
    {
        var label = context.label.Text;
        ReferencedLabels.Add(label);
        ReferencedLabelPositions.TryAdd(label, []);
        ReferencedLabelPositions[label].Add((context.Start.Line - 1, context.label.Column));
        return base.VisitJump_stmt(context);
    }

    public override object VisitTour_stmt([NotNull] DSParser.Tour_stmtContext context)
    {
        ReferencedLabels.Add(context.label.Text);
        ReferencedLabelPositions.TryAdd(context.label.Text, []);
        ReferencedLabelPositions[context.label.Text].Add((context.Start.Line - 1, context.label.Column));
        return base.VisitTour_stmt(context);
    }

    public override object VisitAssign_stmt([NotNull] DSParser.Assign_stmtContext context)
    {
        var varName = context.VARIABLE().GetText();
        if (!varName.Contains('.'))
        {
            varName = varName.Insert(1, _currentLabel + ".");
        }
        DefinedVariables.Add(varName);
        DefinedVariablePositions[varName] = (context.Start.Line - 1, context.VARIABLE().Symbol.Column);
        return base.VisitAssign_stmt(context);
    }

    public override object VisitExpr_primary([NotNull] DSParser.Expr_primaryContext context)
    {
        if (context.VARIABLE() != null)
        {
            var varName = context.VARIABLE().GetText();
            if (!varName.Contains('.'))
            {
                varName = varName.Insert(1, _currentLabel + ".");
            }
            ReferencedVariables.Add(varName);
            ReferencedVariablePositions.TryAdd(varName, []);
            ReferencedVariablePositions[varName].Add((context.Start.Line - 1, context.VARIABLE().Symbol.Column));
        }
        return base.VisitExpr_primary(context);
    }
}