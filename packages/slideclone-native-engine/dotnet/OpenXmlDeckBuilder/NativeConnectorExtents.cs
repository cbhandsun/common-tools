using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeConnectorExtents
{
    // A zero axis is a valid straight-line transform in Office. Expanding it
    // turns an exact horizontal/vertical segment into a diagonal and changes
    // its antialiasing phase. Preserve the legacy guard for non-line presets,
    // collapsed points and positive tiny axes; this is not general rescaling.
    internal static (double Width, double Height) Resolve(double width, double height, string? connectorType)
    {
        var straight = NativeConnectorGeometry.Resolve(connectorType) == A.ShapeTypeValues.Line;
        return (
            straight && width == 0 && height > 0 ? 0 : Math.Max(0.1, width),
            straight && height == 0 && width > 0 ? 0 : Math.Max(0.1, height)
        );
    }
}
