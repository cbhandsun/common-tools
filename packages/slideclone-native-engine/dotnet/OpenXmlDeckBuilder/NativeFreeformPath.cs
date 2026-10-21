using System.Text.Json;

internal static class NativeFreeformPath
{
    // Exact transport coordinates; never clamp, truncate or accept two paths.
    internal static List<FreeformSegmentIr> Read(JsonElement style)
    {
        if (style.TryGetProperty("freeformSegments", out _))
            throw new InvalidDataException("Native freeform geometry is ambiguous");
        var text = style.GetProperty("freeformPath");
        if (text.ValueKind != JsonValueKind.String)
            throw new InvalidDataException("Native freeform path payload is invalid");
        var payload = text.GetString();
        if (payload is null || payload.Length < 3 || payload.Length > 32768)
            throw new InvalidDataException("Native freeform path payload is invalid");
        JsonDocument document;
        try { document = JsonDocument.Parse(payload, new JsonDocumentOptions { MaxDepth = 3 }); }
        catch (JsonException) { throw new InvalidDataException("Native freeform path payload is invalid"); }
        using var admittedDocument = document;
        var rows = document.RootElement;
        if (rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() < 1 || rows.GetArrayLength() > 120)
            throw new InvalidDataException("Native freeform path collection is invalid");
        string[] names = ["moveTo", "lnTo", "cubicBezTo", "quadBezTo", "close"];
        int[] sizes = [1, 1, 3, 2, 0];
        var result = new List<FreeformSegmentIr>();
        foreach (var row in rows.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Array || row.GetArrayLength() < 1 || row.GetArrayLength() > 7
                || row[0].ValueKind != JsonValueKind.Number || !row[0].TryGetDouble(out var numericCode)
                || !double.IsFinite(numericCode) || numericCode < 0 || numericCode > 4 || numericCode != Math.Truncate(numericCode))
                throw new InvalidDataException("Native freeform path command is invalid");
            var code = (int)numericCode;
            if (result.Count == 0 && code != 0 || row.GetArrayLength() != 1 + 2 * sizes[code])
                throw new InvalidDataException("Native freeform path command is invalid");
            var points = new List<PointIr>();
            for (var index = 1; index < row.GetArrayLength(); index += 2)
            {
                if (row[index].ValueKind != JsonValueKind.Number || row[index + 1].ValueKind != JsonValueKind.Number
                    || !row[index].TryGetDouble(out var x) || !row[index + 1].TryGetDouble(out var y)
                    || !double.IsFinite(x) || !double.IsFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
                    throw new InvalidDataException("Native freeform path point is invalid");
                points.Add(new PointIr(x, y));
            }
            result.Add(new FreeformSegmentIr(names[code], points));
        }
        return result;
    }
}
