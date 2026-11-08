using A = DocumentFormat.OpenXml.Drawing;
using System.Globalization;
using System.Text.Json;

internal static class NativeConnectorGeometry
{
    internal static A.PresetGeometry Create(string? type, JsonElement? style)
    {
        if (type?.ToLowerInvariant() == "custom-path")
            throw new InvalidDataException("Native custom connector paths require verified Office support.");
        if (style is { ValueKind: JsonValueKind.Object } pathStyle && pathStyle.TryGetProperty("connectorPath", out _))
            throw new InvalidDataException("Native custom connector paths require verified Office support.");
        // Encode the IR's horizontal-then-vertical route as a three-leg preset
        // whose last leg has zero length. This avoids renderer-dependent
        // bentConnector2 direction and custom connector path normalization.
        if (type?.ToLowerInvariant() == "elbow-2")
        {
            if (style is { ValueKind: JsonValueKind.Object } bendStyle && bendStyle.TryGetProperty("connectorAdjustments", out _))
                throw new InvalidOperationException("Native connector adjustments are invalid.");
            return new A.PresetGeometry(new A.AdjustValueList(
                new A.ShapeGuide { Name = "adj1", Formula = "val 100000" }
            )) { Preset = A.ShapeTypeValues.BentConnector3 };
        }
        var preset = Resolve(type);
        var geometry = new A.PresetGeometry { Preset = preset };
        if (style is not { ValueKind: JsonValueKind.Object } value || !value.TryGetProperty("connectorAdjustments", out var raw)) return geometry;
        var count = type?.ToLowerInvariant() switch
        {
            "curved-3" or "elbow-3" => 1,
            "curved-4" or "elbow-4" => 2,
            "curved-5" or "elbow-5" => 3,
            _ => 0
        };
        if (count == 0 || raw.ValueKind != JsonValueKind.Array || raw.GetArrayLength() != count)
            throw new InvalidOperationException("Native connector adjustments are invalid.");
        var adjustments = new A.AdjustValueList();
        var index = 0;
        foreach (var item in raw.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Number || !item.TryGetDouble(out var number) || !double.IsFinite(number)
                || number < -2147483647 || number > 2147483647)
                throw new InvalidOperationException("Native connector adjustments are invalid.");
            adjustments.Append(new A.ShapeGuide { Name = "adj" + (++index).ToString(CultureInfo.InvariantCulture),
                Formula = "val " + Math.Round(number).ToString(CultureInfo.InvariantCulture) });
        }
        geometry.Append(adjustments);
        return geometry;
    }

    internal static A.ShapeTypeValues Resolve(string? type) => type?.ToLowerInvariant() switch
    {
        "elbow" or "elbow-2" => A.ShapeTypeValues.BentConnector2,
        "elbow-3" => A.ShapeTypeValues.BentConnector3,
        "elbow-4" => A.ShapeTypeValues.BentConnector4,
        "elbow-5" => A.ShapeTypeValues.BentConnector5,
        "curved-2" => A.ShapeTypeValues.CurvedConnector2,
        "curved-3" => A.ShapeTypeValues.CurvedConnector3,
        "curved-4" => A.ShapeTypeValues.CurvedConnector4,
        "curved-5" => A.ShapeTypeValues.CurvedConnector5,
        _ => A.ShapeTypeValues.Line
    };
}
