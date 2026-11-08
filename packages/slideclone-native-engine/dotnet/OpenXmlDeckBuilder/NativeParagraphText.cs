using System.Text.Json;
using DocumentFormat.OpenXml.Drawing;

internal static class NativeParagraphText
{
    public static bool Requested(TextBoxIr text) => text.Style is { ValueKind: JsonValueKind.Object } style
        && style.TryGetProperty("textLayout", out var layout) && layout.ValueKind == JsonValueKind.String
        && layout.GetString() == "paragraph";

    // One editable paragraph with rich runs and real line breaks. OpenXML's
    // text engine owns shaping/wrapping; no child shape or character warp.
    public static Paragraph Create(TextBoxIr text, ParagraphProperties properties,
        Func<FontIr?, string?, RunProperties> createProperties)
    {
        if (text.PositionedRuns is not null || text.Wrap != true || text.Text is null || text.Text.Length > 16000)
            throw new InvalidOperationException("Invalid native paragraph layout.");
        var runs = text.Runs ?? [new TextRunIr(text.Text)];
        if (runs.Count > 512 || runs.Any(run => run is null || run.Text is null)
            || string.Concat(runs.Select(run => run.Text)) != text.Text)
            throw new InvalidOperationException("Invalid native paragraph content.");
        var paragraph = new Paragraph(properties.CloneNode(true));
        foreach (var run in runs)
        {
            var lines = run.Text.Split('\n');
            for (var i = 0; i < lines.Length; i++)
            {
                if (i > 0) paragraph.Append(new Break(createProperties(run.Font, "\n")));
                if (lines[i].Length > 0)
                    paragraph.Append(new Run(createProperties(run.Font, lines[i]), new Text(lines[i])));
            }
        }
        return paragraph;
    }
}
