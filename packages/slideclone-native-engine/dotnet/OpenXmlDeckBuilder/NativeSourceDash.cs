using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeSourceDash
{
    internal static bool Append(A.Outline outline, JsonElement? style)
    {
        if (style is not { ValueKind: JsonValueKind.Object } value || !value.TryGetProperty("strokeDashPattern", out var payload)) return false;
        if (value.TryGetProperty("dash", out _) || payload.ValueKind != JsonValueKind.String)
            throw new InvalidDataException("Native source dash controls are invalid");
        var text = payload.GetString();
        if (text is null || text.Length is < 5 or > 4096) throw new InvalidDataException("Native source dash payload is invalid");
        JsonDocument document;
        try { document = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 3 }); }
        catch (JsonException) { throw new InvalidDataException("Native source dash payload is invalid"); }
        using (document)
        {
            var rows = document.RootElement;
            if (rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() is < 2 or > 16)
                throw new InvalidDataException("Native source dash collection is invalid");
            var custom = new A.CustomDash();
            foreach (var row in rows.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Array || row.GetArrayLength() != 2)
                    throw new InvalidDataException("Native source dash pair is invalid");
                var numbers = new int[2];
                for (var i = 0; i < 2; i++)
                {
                    var item = row[i];
                    if (item.ValueKind != JsonValueKind.Number || !item.TryGetDouble(out var number)
                        || !double.IsFinite(number) || number <= 0 || number > 512)
                        throw new InvalidDataException("Native source dash length is invalid");
                    numbers[i] = checked((int)Math.Round(number * 100000));
                    if (numbers[i] <= 0) throw new InvalidDataException("Native source dash length is invalid");
                }
                custom.Append(new A.DashStop { DashLength = numbers[0], SpaceLength = numbers[1] });
            }
            outline.Append(custom);
        }
        return true;
    }
}
