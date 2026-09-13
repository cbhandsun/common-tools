using System.Text.Json;

internal sealed record NativeResidualLayerPlan(
    IReadOnlyList<VisualElementIr> BackgroundShapes,
    IReadOnlyList<VisualElementIr> ResidualImages,
    IReadOnlyList<VisualElementIr> ForegroundShapes,
    IReadOnlyList<VisualElementIr> RemainingImages)
{
    private const string Mode = "preserve-crop-with-native-and-local-fidelity-overlays";

    public static NativeResidualLayerPlan Create(PageIr page)
    {
        var shapes = page.Shapes ?? [];
        var images = page.Images ?? [];
        if (!images.Any(IsLayeredResidual)) return new([], [], shapes, images);

        var backgrounds = shapes.Where(shape => Flag(shape.Source, "preserveResidualInterior")).ToList();
        var residuals = images.Where(image => !Flag(image.Source, "tableOverlay")
            && (IsLayeredResidual(image) || Flag(image.Source, "residualCrop"))).ToList();
        return new(backgrounds, residuals,
            shapes.Where(shape => !backgrounds.Contains(shape)).ToList(),
            images.Where(image => !residuals.Contains(image)).ToList());
    }

    private static bool IsLayeredResidual(VisualElementIr image)
    {
        var strategy = Property(image.Source, "componentRenderStrategy");
        var mode = Property(strategy, "mode");
        return mode is { ValueKind: JsonValueKind.String }
            && string.Equals(mode.Value.GetString(), Mode, StringComparison.OrdinalIgnoreCase);
    }

    private static bool Flag(JsonElement? source, string name) => Property(source, name) is { ValueKind: JsonValueKind.True };

    private static JsonElement? Property(JsonElement? source, string name)
        => source is { ValueKind: JsonValueKind.Object } && source.Value.TryGetProperty(name, out var value) ? value : null;
}
