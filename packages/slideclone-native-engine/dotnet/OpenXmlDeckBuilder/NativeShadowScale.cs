using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeShadowScale
{
    public static JsonElement? ReadShadow(JsonElement? input)
    {
        if (input is not { ValueKind: JsonValueKind.Object } style) return null;
        var count = 0;
        JsonElement? shadow = null;
        foreach (var property in style.EnumerateObject())
        {
            if (!string.Equals(property.Name, "shadow", StringComparison.OrdinalIgnoreCase)) continue;
            if (property.Name != "shadow" || ++count != 1)
                throw new InvalidOperationException("Native shadow field is invalid.");
            if (property.Value.ValueKind == JsonValueKind.Null) continue;
            if (property.Value.ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("Native shadow object is invalid.");
            shadow = property.Value;
        }
        return shadow;
    }

    // Contract the effect mask independently of shape geometry and connector ports.
    // Missing axes deliberately omit attributes, preserving legacy serialization.
    public static void Apply(A.OuterShadow effect, JsonElement? input)
    {
        if (input is not { ValueKind: JsonValueKind.Object } shadow) return;
        var scaleXCount = 0;
        var scaleYCount = 0;
        foreach (var property in shadow.EnumerateObject())
        {
            var x = string.Equals(property.Name, "scaleX", StringComparison.OrdinalIgnoreCase);
            var y = string.Equals(property.Name, "scaleY", StringComparison.OrdinalIgnoreCase);
            if (!x && !y) continue;
            if ((x && (property.Name != "scaleX" || ++scaleXCount != 1))
                || (y && (property.Name != "scaleY" || ++scaleYCount != 1))
                || property.Value.ValueKind != JsonValueKind.Number
                || !property.Value.TryGetDouble(out var scale) || !double.IsFinite(scale)
                || scale < 0.00001 || scale > 1)
                throw new InvalidOperationException("Native shadow scale is invalid.");
            var nativeScale = checked((int)Math.Round(scale * 100000, MidpointRounding.AwayFromZero));
            if (x) effect.HorizontalRatio = nativeScale;
            else effect.VerticalRatio = nativeScale;
        }
    }
}
