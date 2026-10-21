using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;

internal static class LineEndStyle
{
    internal static void Append(A.Outline outline, JsonElement? style)
    {
        if (ResolveType(GetString(style, "startArrow")) is { } startType)
        {
            outline.Append(new A.HeadEnd
            {
                Type = startType,
                Width = ResolveWidth(GetString(style, "startArrowWidth")),
                Length = ResolveLength(GetString(style, "startArrowLength"))
            });
        }
        if (ResolveType(GetString(style, "endArrow")) is { } endType)
        {
            outline.Append(new A.TailEnd
            {
                Type = endType,
                Width = ResolveWidth(GetString(style, "endArrowWidth")),
                Length = ResolveLength(GetString(style, "endArrowLength"))
            });
        }
    }

    private static string? GetString(JsonElement? value, string property)
    {
        if (value is null || value.Value.ValueKind != JsonValueKind.Object) return null;
        if (!value.Value.TryGetProperty(property, out var child) || child.ValueKind != JsonValueKind.String) return null;
        return child.GetString();
    }

    private static A.LineEndValues? ResolveType(string? value)
    {
        // Keep the historical generic "arrow" alias unchanged. Open source
        // chevrons need an explicit native type instead of a filled triangle.
        if (string.Equals(value, "openArrow", StringComparison.OrdinalIgnoreCase)) return A.LineEndValues.Arrow;
        if (string.Equals(value, "triangle", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "arrow", StringComparison.OrdinalIgnoreCase)) return A.LineEndValues.Triangle;
        return null;
    }

    private static A.LineEndWidthValues ResolveWidth(string? value) => NormalizeSize(value) switch
    {
        "small" => A.LineEndWidthValues.Small,
        "large" => A.LineEndWidthValues.Large,
        _ => A.LineEndWidthValues.Medium
    };

    private static A.LineEndLengthValues ResolveLength(string? value) => NormalizeSize(value) switch
    {
        "small" => A.LineEndLengthValues.Small,
        "large" => A.LineEndLengthValues.Large,
        _ => A.LineEndLengthValues.Medium
    };

    private static string NormalizeSize(string? value) => (value ?? "").Trim().ToLowerInvariant() switch
    {
        "sm" => "small",
        "lg" => "large",
        "med" => "medium",
        var normalized => normalized
    };
}
