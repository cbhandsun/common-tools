using A = DocumentFormat.OpenXml.Drawing;

internal static class TextCharacterSpacing
{
    public static void Apply(A.RunProperties properties, double? spacingPt)
    {
        if (spacingPt is null) return;
        if (!double.IsFinite(spacingPt.Value) || Math.Abs(spacingPt.Value) > 12)
            throw new ArgumentOutOfRangeException(nameof(spacingPt), "Invalid native character spacing");
        properties.Spacing = (int)Math.Round(spacingPt.Value * 100, MidpointRounding.AwayFromZero);
    }
}
