using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeGlow
{
    // A native effect stays on the original object; it supplies no geometry,
    // source ownership, raster-erasure permission or editability exemption.
    internal static A.Glow? Read(JsonElement? input)
    {
        if (input is not { ValueKind: JsonValueKind.Object } style) return null;
        JsonElement? value = null;
        var count = 0;
        foreach (var property in style.EnumerateObject())
        {
            if (!string.Equals(property.Name, "glow", StringComparison.OrdinalIgnoreCase)) continue;
            if (property.Name != "glow" || ++count != 1)
                throw new InvalidDataException("Native glow field is invalid.");
            if (property.Value.ValueKind == JsonValueKind.Null) continue;
            if (property.Value.ValueKind != JsonValueKind.Object)
                throw new InvalidDataException("Native glow object is invalid.");
            value = property.Value;
        }
        if (value is not JsonElement glow) return null;
        var fields = new HashSet<string>(StringComparer.Ordinal);
        double radius = double.NaN, alpha = double.NaN;
        string? color = null;
        foreach (var property in glow.EnumerateObject())
        {
            if (!fields.Add(property.Name)) throw new InvalidDataException("Native glow fields are invalid.");
            switch (property.Name)
            {
                case "radiusPt": radius = Number(property.Value, 40); break;
                case "alpha": alpha = Number(property.Value, 1); break;
                case "color":
                    if (property.Value.ValueKind != JsonValueKind.String)
                        throw new InvalidDataException("Native glow color is invalid.");
                    color = property.Value.GetString();
                    if (color is null || color.Length != 7 || color[0] != '#'
                        || !color.Skip(1).All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F'))
                        throw new InvalidDataException("Native glow color is invalid.");
                    break;
                default: throw new InvalidDataException("Native glow fields are invalid.");
            }
        }
        if (!double.IsFinite(radius) || !double.IsFinite(alpha) || color is null)
            throw new InvalidDataException("Native glow fields are incomplete.");
        return new A.Glow(new A.RgbColorModelHex(new A.Alpha { Val = (int)Math.Round(alpha * 100000) })
        { Val = color[1..].ToUpperInvariant() }) { Radius = (long)Math.Round(radius * 12700) };
    }

    private static double Number(JsonElement value, double maximum)
    {
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var number)
            || !double.IsFinite(number) || number < 0 || number > maximum)
            throw new InvalidDataException("Native glow numeric value is invalid.");
        return number;
    }
}
