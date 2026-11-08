using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeTextWarp
{
    public static void Apply(A.BodyProperties body, TextBoxIr textBox)
    {
        if (textBox.Style is not { ValueKind: JsonValueKind.Object } style) return;
        foreach (var property in style.EnumerateObject())
            if (string.Equals(property.Name, "textWarp", StringComparison.OrdinalIgnoreCase) && property.Name != "textWarp")
                throw new InvalidOperationException("Native text warp field casing is invalid.");
        if (!style.TryGetProperty("textWarp", out var warp)) return;
        if (warp.ValueKind != JsonValueKind.String || warp.GetString() != "textPlain")
            throw new InvalidOperationException("Native text warp is invalid.");
        if (textBox.Runs is not null || (textBox.Text ?? string.Empty).IndexOfAny(['\r', '\n']) >= 0)
            throw new InvalidOperationException("Native text warp requires plain single-line text.");
        if (textBox.Wrap == true || (style.TryGetProperty("wrap", out var wrap) && wrap.ValueKind != JsonValueKind.False)
            || (style.TryGetProperty("fit", out var fit) && fit.ValueKind == JsonValueKind.String
                && string.Equals(fit.GetString(), "shrink", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Native text warp cannot wrap or autofit.");
        body.Wrap = A.TextWrappingValues.None;
        body.FromWordArt = true;
        body.Append(new A.PresetTextWarp(new A.AdjustValueList()) { Preset = A.TextShapeValues.TextPlain });
    }
}
