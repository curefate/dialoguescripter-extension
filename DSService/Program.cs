using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Antlr4.Runtime;
using Antlr4.Runtime.Misc;
using Antlr4.Runtime.Tree;

class Program
{
    static readonly Dictionary<string, string> _fileCache = [];
    static readonly VisitorChecker _globalVisitor = new();

    public static string GetCode(string filePath)
    {
        if (!_fileCache.TryGetValue(filePath, out var code))
            code = File.Exists(filePath) ? File.ReadAllText(filePath) : string.Empty;
        return code;
    }

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

                            var code = GetCode(filePath);

                            Console.Error.WriteLine($"[DS C#] Analyzing file: {filePath}({code.Length} chars)");

                            var result = AnalyzeCode(code, filePath);
                            Console.WriteLine(JsonSerializer.Serialize(result));
                            break;
                        }
                    case "definition":
                        {
                            var filePath = root.GetProperty("filePath").GetString();
                            var pos = root.GetProperty("position");
                            var line = pos.GetProperty("line").GetInt32();
                            var col = pos.GetProperty("character").GetInt32();

                            if (filePath == null) break;
                            var def = FindDefinition(line, col);
                            var code = GetCode(filePath);
                            AnalyzeCode(code, filePath);
                            Console.Error.WriteLine($"[DS C#] Finding definition: ln{line} col{col}");
                            if (def.HasValue)
                            {
                                var position = new Position()
                                {
                                    FilePath = def.Value.file,
                                    StartLine = def.Value.line,
                                    StartColumn = def.Value.col,
                                    EndLine = def.Value.line,
                                    EndColumn = def.Value.col + def.Value.length,
                                };
                                Console.WriteLine(JsonSerializer.Serialize(new Result
                                {
                                    Type = "DefinitionResult",
                                    Positions = [position]
                                }));
                            }
                            else
                            {
                                Console.WriteLine(JsonSerializer.Serialize(new Result
                                {
                                    Type = "DefinitionResult",
                                }));
                            }
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

    static bool InRange((string file, int line, int col, int length) r, int line, int col)
    => r.line == line && col >= r.col && col <= r.col + r.length;

    static (string file, int line, int col, int length)? FindDefinition(int line, int col)
    {
        foreach (var kv in _globalVisitor.ReferencedLabels)
            foreach (var pos in kv.Value)
                if (InRange(pos, line, col) && _globalVisitor.DefinedLabels.ContainsKey(kv.Key) && _globalVisitor.DefinedLabels[kv.Key].Count == 1)
                    return _globalVisitor.DefinedLabels[kv.Key][0];
        foreach (var kv in _globalVisitor.ReferencedVariables)
            foreach (var pos in kv.Value)
                if (InRange(pos, line, col) && _globalVisitor.DefinedVariables.ContainsKey(kv.Key) && _globalVisitor.DefinedVariables[kv.Key].Count == 1)
                    return _globalVisitor.DefinedVariables[kv.Key][0];
        foreach (var kv in _globalVisitor.DefinedLabels)
            if (_globalVisitor.DefinedLabels.ContainsKey(kv.Key) && _globalVisitor.DefinedLabels[kv.Key].Count == 1 && InRange(_globalVisitor.DefinedLabels[kv.Key][0], line, col))
                return _globalVisitor.DefinedLabels[kv.Key][0];
        foreach (var kv in _globalVisitor.DefinedVariables)
            if (_globalVisitor.DefinedVariables.ContainsKey(kv.Key) && _globalVisitor.DefinedVariables[kv.Key].Count == 1 && InRange(_globalVisitor.DefinedVariables[kv.Key][0], line, col))
                return _globalVisitor.DefinedVariables[kv.Key][0];

        return null;
    }

    static Result AnalyzeCode(string code, string filePath)
    {
        var inputStream = new AntlrInputStream(code)
        {
            name = filePath
        };
        var lexer = new DSLexer(inputStream);
        var tokens = new CommonTokenStream(lexer);
        var parser = new DSParser(tokens);
        parser.RemoveErrorListeners();
        var errorListener = new DSErrorListener();
        parser.AddErrorListener(errorListener);
        var tree = parser.program();

        var diagList = new List<Diagnostic>(errorListener.Diagnostics);

        var visitor = _globalVisitor;
        visitor.Visit(tree);
        diagList.AddRange(visitor.AdditionDiags);
        // 检查标签重复定义
        foreach (var kv in visitor.DefinedLabels)
        {
            if (kv.Value.Count > 1)
            {
                foreach (var pos in kv.Value)
                {
                    if (pos.file != filePath) continue;
                    diagList.Add(new Diagnostic
                    {
                        Line = pos.line,
                        Column = pos.col,
                        Message = $"Label '{kv.Key}' is already defined.",
                        Severity = 1
                    });
                }
            }
        }
        // 检查标签引用
        foreach (var kv in visitor.ReferencedLabels)
        {
            if (!visitor.DefinedLabels.ContainsKey(kv.Key))
            {
                foreach (var pos in kv.Value)
                {
                    if (pos.file != filePath) continue;
                    diagList.Add(new Diagnostic
                    {
                        Line = pos.line,
                        Column = pos.col,
                        Message = $"Undefined label '{kv.Key}'.",
                        Severity = 1
                    });
                }
            }
        }
        // 检查变量重复定义，及其作用域label是否存在
        foreach (var kv in visitor.DefinedVariables)
        {
            if (kv.Value.Count > 1)
            {
                foreach (var pos in kv.Value)
                {
                    if (pos.file != filePath) continue;
                    diagList.Add(new Diagnostic
                    {
                        Line = pos.line,
                        Column = pos.col,
                        Message = $"Variable '{kv.Key}' is already defined.",
                        Severity = 1
                    });
                }
            }
            var field = kv.Key.Split('.')[0][1..];
            if (!visitor.DefinedLabels.ContainsKey(field))
            {
                foreach (var pos in kv.Value)
                {
                    if (pos.file != filePath) continue;
                    diagList.Add(new Diagnostic
                    {
                        Line = pos.line,
                        Column = pos.col,
                        Message = $"Label '{field}' for variable '{kv.Key}' is not defined.",
                        Severity = 1
                    });
                }
            }
        }
        // 检查变量引用
        foreach (var kv in visitor.ReferencedVariables)
        {
            if (!visitor.DefinedVariables.ContainsKey(kv.Key))
            {
                foreach (var pos in kv.Value)
                {
                    if (pos.file != filePath) continue;
                    diagList.Add(new Diagnostic
                    {
                        Line = pos.line,
                        Column = pos.col,
                        Message = $"Undefined variable '{kv.Key}'.",
                        Severity = 1
                    });
                }
            }
        }

        return new Result
        {
            Type = "AnalyzeResult",
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
            Message = msg,
            Severity = 1
        });
    }
}

internal class VisitorChecker : DSParserBaseVisitor<object>
{
    public Dictionary<string, List<(string file, int line, int col, int length)>> DefinedLabels = [];
    public Dictionary<string, List<(string file, int line, int col, int length)>> ReferencedLabels = [];
    public Dictionary<string, List<(string file, int line, int col, int length)>> DefinedVariables = [];
    public Dictionary<string, List<(string file, int line, int col, int length)>> ReferencedVariables = [];
    public List<Diagnostic> AdditionDiags = [];
    private string _currentLabel = string.Empty;

    public override object Visit(IParseTree tree)
    {
        DefinedLabels.Clear();
        ReferencedLabels.Clear();
        DefinedVariables.Clear();
        ReferencedVariables.Clear();
        AdditionDiags.Clear();
        _currentLabel = string.Empty;
        return base.Visit(tree);
    }

    public override object VisitImport_stmt([NotNull] DSParser.Import_stmtContext context)
    {
        // 只解析目标脚本的定义，不收集错误
        var path = context.path.Text.Trim();
        var target = Path.GetFullPath(Path.Combine(
            Path.GetDirectoryName(context.Start.TokenSource.SourceName) ?? "",
            path
            ));
        if (Path.GetExtension(target) != ".ds")
        {
            AdditionDiags.Add(new Diagnostic
            {
                Line = context.Start.Line - 1,
                Column = context.path.Column,
                Message = $"Import file '{path}' is not a .ds file.",
                Severity = 1
            });
            return base.VisitImport_stmt(context);
        }
        if (!File.Exists(target))
        {
            AdditionDiags.Add(new Diagnostic
            {
                Line = context.Start.Line - 1,
                Column = context.path.Column,
                Message = $"Import file '{path}' not found.",
                Severity = 1
            });
            return base.VisitImport_stmt(context);
        }
        var code = Program.GetCode(target);
        ICharStream inputStream = !string.IsNullOrEmpty(code) ? new AntlrInputStream(code)
        {
            name = target
        } : new AntlrFileStream(target);
        var lexer = new DSLexer(inputStream);
        var tokens = new CommonTokenStream(lexer);
        var parser = new DSParser(tokens);
        parser.RemoveErrorListeners();
        var errorListener = new DSErrorListener();
        parser.AddErrorListener(errorListener);
        var tree = parser.program();
        base.Visit(tree);
        return base.VisitImport_stmt(context);
    }

    public override object VisitLabel_block([NotNull] DSParser.Label_blockContext context)
    {
        var label = context.label.Text;
        DefinedLabels.TryAdd(label, []);
        DefinedLabels[label].Add((
            context.Start.TokenSource.SourceName,
            context.Start.Line - 1,
            context.label.Column,
            label.Length
            ));
        _currentLabel = label;
        return base.VisitLabel_block(context);
    }

    public override object VisitJump_stmt([NotNull] DSParser.Jump_stmtContext context)
    {
        var label = context.label.Text;
        ReferencedLabels.TryAdd(label, []);
        ReferencedLabels[label].Add((
            context.Start.TokenSource.SourceName,
            context.Start.Line - 1,
            context.label.Column,
            label.Length
            ));
        return base.VisitJump_stmt(context);
    }

    public override object VisitTour_stmt([NotNull] DSParser.Tour_stmtContext context)
    {
        var label = context.label.Text;
        ReferencedLabels.TryAdd(label, []);
        ReferencedLabels[label].Add((
            context.Start.TokenSource.SourceName,
            context.Start.Line - 1,
            context.label.Column,
            label.Length
            ));
        return base.VisitTour_stmt(context);
    }

    public override object VisitAssign_stmt([NotNull] DSParser.Assign_stmtContext context)
    {
        var raw = context.VARIABLE().GetText();
        var varName = raw;
        if (!varName.Contains('.'))
        {
            varName = varName.Insert(1, _currentLabel + ".");
        }
        DefinedVariables.TryAdd(varName, []);
        DefinedVariables[varName].Add((
            context.Start.TokenSource.SourceName,
            context.Start.Line - 1,
            context.VARIABLE().Symbol.Column,
            raw.Length
            ));
        return base.VisitAssign_stmt(context);
    }

    public override object VisitExpr_primary([NotNull] DSParser.Expr_primaryContext context)
    {
        if (context.VARIABLE() != null)
        {
            var raw = context.VARIABLE().GetText();
            var varName = raw;
            if (!varName.Contains('.'))
            {
                varName = varName.Insert(1, _currentLabel + ".");
            }
            ReferencedVariables.TryAdd(varName, []);
            ReferencedVariables[varName].Add((
                context.Start.TokenSource.SourceName,
                context.Start.Line - 1,
                context.VARIABLE().Symbol.Column,
                raw.Length
                ));
        }
        return base.VisitExpr_primary(context);
    }
}

public class Result
{
    public string Type { get; set; }
    public Diagnostic[] Diagnostics { get; set; }
    public Position[] Positions { get; set; }
}

public class Position
{
    public string FilePath { get; set; }
    public int StartLine { get; set; }
    public int StartColumn { get; set; }
    public int EndLine { get; set; }
    public int EndColumn { get; set; }
}

public class Diagnostic
{
    public int Line { get; set; }
    public int Column { get; set; }
    public string Message { get; set; }
    public int Severity { get; set; } = 1; // 1=Error, 2=Warning, 3=Info, 4=Hint
}