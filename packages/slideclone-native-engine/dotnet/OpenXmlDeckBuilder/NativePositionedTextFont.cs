using System.Text.Json;

internal static class NativePositionedTextFont
{
    public static FontIr? Merge(FontIr? parent, JsonElement? input)
    {
        if (input is null || input.Value.ValueKind == JsonValueKind.Null) return parent;
        if (input.Value.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("Positioned text font override is invalid.");
        var result = parent ?? new FontIr(null, null, null, null, null, null, null);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in input.Value.EnumerateObject())
        {
            if (!seen.Add(property.Name) || property.Value.ValueKind != JsonValueKind.String)
                throw new InvalidOperationException("Positioned text font override is invalid.");
            var value = property.Value.GetString();
            if (property.Name == "weight")
            {
                if (value is not ("bold" or "regular" or "normal"))
                    throw new InvalidOperationException("Positioned text font weight is invalid.");
            }
            else if (value is null || value.Length is < 1 or > 256 || string.IsNullOrWhiteSpace(value)
                || value.Any(character => character < 32 || character == 127))
                throw new InvalidOperationException("Positioned text font family is invalid.");
            result = property.Name switch
            {
                "family" => result with { Family = value },
                "latinFamily" => result with { LatinFamily = value },
                "eastAsianFamily" => result with { EastAsianFamily = value },
                "complexScriptFamily" => result with { ComplexScriptFamily = value },
                "weight" => result with { Weight = value },
                _ => throw new InvalidOperationException("Positioned text font override field is invalid.")
            };
        }
        return seen.Count == 0 ? parent : result;
    }
}
