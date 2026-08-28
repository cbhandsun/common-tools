using System.Text.Json;

public sealed record DeckIr(string Version, SlideSizeIr SlideSize, List<PageIr> Pages);
public sealed record BatchBuildManifest(List<BatchBuildJob> Jobs, int? Concurrency = null);
public sealed record BatchBuildJob(string Ir, string Out, string? TemplatePptx = null);
public sealed record SlideSizeIr(double WidthPt, double HeightPt);
public sealed record DependencyProbe(string Name, bool Present, string? FoundAt);
public sealed record PageIr(
    int PageIndex,
    string SourceImage,
    List<TextBoxIr> TextBoxes,
    List<VisualElementIr>? Shapes,
    List<VisualElementIr>? Images,
    List<VisualElementIr>? Tables,
    List<ChartIr>? Charts,
    JsonElement? Background,
    bool? PreserveTemplateSlide = null,
    string? SpeakerNotes = null,
    List<CitationIr>? Citations = null,
    PageIntentIr? Intent = null
)
{
    public SlideSizeIr SlideSize { get; set; } = new(960, 540);
}
public sealed record PageIntentIr(string? TemplateLayoutId = null, string? TemplateLayoutName = null, int? TemplatePlaceholderCapacity = null, int? TemplateLayoutDemand = null, string? TemplateLayoutFit = null, string? TemplateLayoutMode = null, List<PlaceholderBindingIr>? TemplatePlaceholderBindings = null);
public sealed record PlaceholderBindingIr(string ObjectId, string? Role = null, string? PlaceholderType = null);
public sealed record CitationIr(string Id, string Title, string Locator, string? AccessedAt = null, string? License = null);
public sealed record TextBoxIr(string Id, string Text, BoxIr Box, FontIr? Font, JsonElement? Style = null, double? Rotation = null, JsonElement? Source = null, bool? Wrap = null, List<TextRunIr>? Runs = null, string? Role = null);
public sealed record TextRunIr(string Text, FontIr? Font = null);
public sealed record BoxIr(double X, double Y, double W, double H);
public sealed record PointIr(double X, double Y);
public sealed record FreeformSegmentIr(string Type, List<PointIr> Points);
public sealed record FontIr(string? Family, double? SizePt, string? Weight, string? Color, string? Align, string? Valign, double? LineHeightMultiple, double? Opacity = null);
public sealed record VisualElementIr(
    string Id,
    string? Type,
    BoxIr Box,
    JsonElement? Style,
    JsonElement? Source,
    string? AssetPath,
    List<List<string>>? Rows,
    List<PointIr>? Points = null
);
public sealed record ChartIr(
    string Id,
    string? Type,
    BoxIr Box,
    JsonElement? Style,
    List<string>? Categories,
    List<double>? Values,
    List<ChartSeriesIr>? Series,
    JsonElement? NativePayload = null,
    JsonElement? Source = null
);
public sealed record ChartSeriesIr(string? Name, List<double> Values);
public sealed record NativeChartSeriesData(string Name, List<double> Values);
public sealed record ComponentReplacementApplyPlan(string? Pptx, List<ComponentReplacementOperation>? Operations);
public sealed record ComponentReplacementOperation(
    string? Operation,
    string? Status,
    string? GroupKey,
    string? Provider,
    string? Kind,
    string? ComponentId,
    string? Layer,
    string? Tier,
    double? Score,
    int? AnchorCount,
    List<int>? Slides,
    List<string>? DrawingNames,
    ComponentReplacementTarget? Target,
    ComponentReplacementSample? Sample
);
public sealed record ComponentReplacementTarget(
    string? Deck,
    int? Slide,
    string? ImageId,
    int? ImageIndex,
    string? LayerKey,
    ComponentReplacementBox? Box
);
public sealed record ComponentReplacementBox(double X, double Y, double W, double H);
public sealed record ComponentReplacementSample(
    string? Provider,
    string? Path,
    string? Name,
    string? AssetKind,
    List<string>? RoleTags,
    double? MatchScore,
    ComponentReplacementRecommendedGroup? RecommendedGroup,
    string? Sha256 = null
);
public sealed record ComponentReplacementRecommendedGroup(
    string? Id,
    string? Name,
    int? Slide,
    int? GroupIndex,
    double? MatchScore,
    double? ComponentScore
);
public sealed record ComponentReplacementOperationReport(
    string? GroupKey,
    string Status,
    bool Applied,
    int RemovedShapeCount,
    int ClonedShapeCount,
    string? SamplePath,
    string? SampleGroupId,
    string? SampleSelectionMode,
    string? Reason,
    ShapeBounds? TargetBounds,
    ShapeBounds? AppliedBounds,
    double? BoundsIoU,
    double? CenterOffsetPt
);
public sealed record ShapeBounds(float X, float Y, float W, float H);
