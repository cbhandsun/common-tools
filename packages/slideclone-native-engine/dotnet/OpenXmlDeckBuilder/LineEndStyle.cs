using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;

internal static class LineEndStyle
{
    internal static void Append(A.Outline outline, JsonElement? style)
    {
        if (IsArrow(GetString(style, "startArrow")))
        {
            outline.Append(new A.HeadEnd
            {
                Type = A.LineEndValues.Triangle,
                Width = ResolveWidth(GetString(style, "startArrowWidth")),
                Length = ResolveLength(GetString(style, "startArrowLength"))
            });
        }
        if (IsArrow(GetString(style, "endArrow")))
        {
            outline.Append(new A.TailEnd
            {
                Type = A.LineEndValues.Triangle,
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

    private static bool IsArrow(string? value) =>
        string.Equals(value, "triangle", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(value, "arrow", StringComparison.OrdinalIgnoreCase);

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
