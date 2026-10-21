using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeTextOutline
{
    // Native editable run paint. No source geometry or glyph path is accepted.
    public static void Apply(A.RunProperties properties, JsonElement? input, double opacity)
    {
        if (input is not { ValueKind: JsonValueKind.Object } style) return;
        var colorCount = 0;
        var widthCount = 0;
        foreach (var property in style.EnumerateObject())
        {
            if (string.Equals(property.Name, "textOutlineColor", StringComparison.OrdinalIgnoreCase))
            {
                if (property.Name != "textOutlineColor") throw new InvalidOperationException("Native text outline casing is invalid.");
                colorCount++;
            }
            if (string.Equals(property.Name, "textOutlineWidthPt", StringComparison.OrdinalIgnoreCase))
            {
                if (property.Name != "textOutlineWidthPt") throw new InvalidOperationException("Native text outline casing is invalid.");
                widthCount++;
            }
        }
        if (colorCount == 0 && widthCount == 0) return;
        var paragraphPaint = style.TryGetProperty("textLayout", out var layout)
            && layout.ValueKind == JsonValueKind.String && layout.GetString() == "paragraph"
            && !style.TryGetProperty("textWarp", out _);
        var legacyPaint = style.TryGetProperty("textWarp", out var warp)
            && warp.ValueKind == JsonValueKind.String && warp.GetString() == "textPlain";
        if (colorCount != 1 || widthCount != 1
            || !style.TryGetProperty("textOutlineColor", out var color) || color.ValueKind != JsonValueKind.String
            || !style.TryGetProperty("textOutlineWidthPt", out var width) || width.ValueKind != JsonValueKind.Number
            || !width.TryGetDouble(out var widthPt) || !double.IsFinite(widthPt) || widthPt <= 0 || widthPt > 12
            || !(paragraphPaint || legacyPaint))
            throw new InvalidOperationException("Native text outline paint is invalid.");
        var rgb = color.GetString();
        if (rgb is null || rgb.Length != 7 || rgb[0] != '#' || rgb.AsSpan(1).ContainsAnyExcept("0123456789abcdefABCDEF"))
            throw new InvalidOperationException("Native text outline color is invalid.");
        var paint = new A.RgbColorModelHex { Val = rgb[1..].ToUpperInvariant() };
        if (opacity < 0.999) paint.Append(new A.Alpha { Val = (int)Math.Round(opacity * 100000) });
        properties.Append(new A.Outline(new A.SolidFill(paint),
            new A.PresetDash { Val = A.PresetLineDashValues.Solid }, new A.Round())
        {
            Width = checked((int)Math.Round(widthPt * 12700)),
            CapType = A.LineCapValues.Round
        });
    }
}
