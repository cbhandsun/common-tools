using System.Text.Json;

internal static class EditableChartFallbackWriter
{
    public static IEnumerable<object> Create(ChartIr chart)
    {
        var box = chart.Box;
        var style = chart.Style;
        var fill = GetString(style, "fill") ?? "#FFFFFF";
        var stroke = GetString(style, "stroke") ?? "#D0D7DE";
        var barFill = GetString(style, "barFill") ?? GetString(style, "accent") ?? "#2F80ED";
        var axisColor = GetString(style, "axisColor") ?? "#666666";
        var textColor = GetString(style, "textColor") ?? "#222222";
        var fontFamily = GetString(style, "fontFamily") ?? "Microsoft YaHei";
        var fontSize = GetNumber(style, "fontSizePt") ?? 9;
        yield return new VisualElementIr($"{chart.Id}-plot-bg", "rect", box,
            JsonSerializer.SerializeToElement(new { fill, stroke, strokeWidthPt = 0.4 }), null, null, null);

        var values = Values(chart).ToList();
        if (values.Count == 0) yield break;
        if (values.Any(value => !double.IsFinite(value))) throw new InvalidOperationException($"Chart {chart.Id} contains a non-finite fallback value.");
        var labels = Labels(chart, values.Count).ToList();
        var maxValue = Math.Max(1, values.Max(value => Math.Abs(value)));
        var plotLeft = box.X + box.W * 0.12;
        var plotTop = box.Y + box.H * 0.12;
        var plotWidth = box.W * 0.82;
        var plotHeight = box.H * 0.68;
        var gap = plotWidth / values.Count * 0.22;
        var slotWidth = plotWidth / values.Count;
        var barWidth = Math.Max(1, slotWidth - gap);
        var baselineY = plotTop + plotHeight;
        yield return new VisualElementIr($"{chart.Id}-axis-x", "line", new BoxIr(plotLeft, baselineY, plotWidth, 0),
            JsonSerializer.SerializeToElement(new { stroke = axisColor, strokeWidthPt = 0.6 }), null, null, null);

        for (var index = 0; index < values.Count; index++)
        {
            var value = Math.Max(0, values[index]);
            var height = plotHeight * value / maxValue;
            var x = plotLeft + index * slotWidth + gap / 2;
            var y = baselineY - height;
            yield return new VisualElementIr($"{chart.Id}-bar-{index + 1}", "rect", new BoxIr(x, y, barWidth, Math.Max(1, height)),
                JsonSerializer.SerializeToElement(new { fill = barFill, stroke = "none" }), null, null, null);
            yield return new TextBoxIr($"{chart.Id}-label-{index + 1}", labels.ElementAtOrDefault(index) ?? string.Empty,
                new BoxIr(x - gap / 2, baselineY + box.H * 0.02, slotWidth, box.H * 0.12),
                new FontIr(fontFamily, fontSize, "regular", textColor, "center", "middle", null));
        }
    }

    private static IEnumerable<double> Values(ChartIr chart) => chart.Values is { Count: > 0 } ? chart.Values : chart.Series?.FirstOrDefault()?.Values ?? [];
    private static IEnumerable<string> Labels(ChartIr chart, int count) => chart.Categories is { Count: > 0 } ? chart.Categories : Enumerable.Range(1, count).Select(index => index.ToString());
    private static string? GetString(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static double? GetNumber(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number) ? number : null;
}
