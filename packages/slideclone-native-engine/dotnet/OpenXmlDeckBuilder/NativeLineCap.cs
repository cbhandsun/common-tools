using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeLineCap
{
    internal static A.LineCapValues? Resolve(JsonElement? style)
    {
        if (style is not { ValueKind: JsonValueKind.Object } value) return null;
        A.LineCapValues? cap = null;
        var seen = false;
        foreach (var property in value.EnumerateObject())
        {
            if (!string.Equals(property.Name, "lineCap", StringComparison.OrdinalIgnoreCase)) continue;
            if (seen || property.Name != "lineCap" || property.Value.ValueKind != JsonValueKind.String)
                throw new InvalidDataException("Native line cap is invalid");
            seen = true;
            cap = property.Value.GetString() switch
            {
                "flat" => A.LineCapValues.Flat,
                "round" => A.LineCapValues.Round,
                "square" => A.LineCapValues.Square,
                _ => throw new InvalidDataException("Native line cap is invalid")
            };
        }
        return cap;
    }
}
