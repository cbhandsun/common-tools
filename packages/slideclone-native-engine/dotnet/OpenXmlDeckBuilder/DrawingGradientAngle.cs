internal static class DrawingGradientAngle
{
    // DrawingML linear gradients use ST_PositiveFixedAngle, unlike rotations.
    // Reduce before scaling to avoid overflowing for large finite input.
    internal static int Convert(double degrees)
    {
        if (!double.IsFinite(degrees)) throw new ArgumentOutOfRangeException(nameof(degrees));
        var wrapped = ((degrees % 360) + 360) % 360;
        return (int)Math.Round(wrapped * 60000) % 21600000;
    }
}
