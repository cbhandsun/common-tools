using System.Globalization;
using System.Text;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
var options = CommandLineOptions.Parse(args);
if (ComponentReplacementCommand.TryRun(options)) return;
if (options.TryGetValue("batch", out var batchFileValue))
{
    var outputs = DeckBatchBuilder.Build(batchFileValue, PowerPointSafeEnabled(options), BuildDeck);
    Console.WriteLine(JsonSerializer.Serialize(new
    {
        provider = "openxml-deck-builder-batch",
        count = outputs.Count,
        outputs
    }));
    return;
}
if (!options.TryGetValue("ir", out var irFileValue))
{
    Console.Error.WriteLine("Usage: OpenXmlDeckBuilder --ir <deck.json> --out <deck.pptx> OR --batch <manifest.json> OR --render-pptx <deck.pptx> --out-dir <render-dir>");
    Environment.Exit(1);
}
if (!options.TryGetValue("out", out var outFileValue))
{
    Console.Error.WriteLine("Usage: OpenXmlDeckBuilder --ir <deck.json> --out <deck.pptx> OR --batch <manifest.json> OR --render-pptx <deck.pptx> --out-dir <render-dir>");
    Environment.Exit(1);
}
BuildDeck(
    irFileValue,
    outFileValue,
    powerpointSafe: PowerPointSafeEnabled(options),
    templatePptx: options.TryGetValue("template-pptx", out var templatePptxValue) ? templatePptxValue : null
);

static void BuildDeck(string irFile, string outFile, bool echo = true, bool powerpointSafe = false, string? templatePptx = null)
{
    DeckPackageWriter.Build(
        irFile,
        outFile,
        templatePptx,
        CreateSlide,
        PresentationScaffoldFactory.CreateSlideMaster,
        PresentationScaffoldFactory.CreateSlideLayout
    );
    if (echo) Console.WriteLine(outFile);
}

static bool PowerPointSafeEnabled(IReadOnlyDictionary<string, string> options)
{
    // Retained for CLI compatibility. The OpenXML writer now emits the final
    // package directly and no longer invokes a licensed post-processor.
    return CommandLineOptions.IsEnabled(options, "powerpoint-safe");
}
static P.Slide CreateSlide(PageIr page, SlidePart slidePart, string irDirectory)
{
    var shapeTree = new P.ShapeTree();
    shapeTree.Append(new P.NonVisualGroupShapeProperties(
        new P.NonVisualDrawingProperties { Id = 1U, Name = "" },
        new P.NonVisualGroupShapeDrawingProperties(),
        new P.ApplicationNonVisualDrawingProperties()
    ));
    shapeTree.Append(new P.GroupShapeProperties(new A.TransformGroup()));

    uint shapeId = 2U;
    if (!string.IsNullOrWhiteSpace(GetString(page.Background, "fill")))
    {
        shapeTree.Append(CreateBackground(page, shapeId++));
    }

    var boxIndex = BuildBoxIndex(page);
    var placeholderBindings = TemplatePlaceholderWriter.BuildIndex(page);
    var usesTemplateBindings = page.Intent?.TemplatePlaceholderBindings is not null;

    var overlayUnderlayImages = (page.Images ?? [])
        .Where(IsNativeOverlayUnderlay)
        .ToList();
    foreach (var image in overlayUnderlayImages)
    {
        if (TryCreatePicture(image, slidePart, shapeId, irDirectory, out var picture, TemplatePlaceholderWriter.Binding(placeholderBindings, "images", image.Id)))
        {
            shapeTree.Append(picture);
            shapeId++;
        }
    }

    var tableOverlayImages = (page.Images ?? [])
        .Where(IsTableOverlayElement)
        .ToList();
    var componentImages = (page.Images ?? [])
        .Where(image => !IsNativeOverlayUnderlay(image) && !IsTableOverlayElement(image))
        .ToList();
    var componentTextBoxes = (page.TextBoxes ?? [])
        .Where(textBox => !IsTableOverlaySource(textBox.Source))
        .ToList();
    var groupedComponentIds = AppendGroupedShapes(
        shapeTree,
        page.Shapes ?? [],
        componentImages,
        componentTextBoxes,
        slidePart,
        irDirectory,
        ref shapeId,
        boxIndex,
        usesTemplateBindings
    );

    foreach (var image in componentImages)
    {
        if (groupedComponentIds.ImageIds.Contains(image.Id)) continue;
        if (TryCreatePicture(image, slidePart, shapeId, irDirectory, out var picture, TemplatePlaceholderWriter.Binding(placeholderBindings, "images", image.Id)))
        {
            shapeTree.Append(picture);
            shapeId++;
        }
    }

    foreach (var table in page.Tables ?? [])
    {
        if (table.Rows is { Count: > 0 })
        {
            var drawingProperties = CreateNonVisualDrawingProperties(shapeId, SafeDrawingName(table.Id, "Table", shapeId), table.Source);
            shapeTree.Append(NativeTableWriter.Create(table, shapeId++, drawingProperties, TemplatePlaceholderWriter.CreateApplicationProperties(TemplatePlaceholderWriter.Binding(placeholderBindings, "tables", table.Id))));
            foreach (var line in NativeTableWriter.GridOverlays(table))
            {
                shapeTree.Append(CreateShape(line, shapeId++, boxIndex));
            }
            foreach (var textBox in NativeTableWriter.TextOverlays(table))
            {
                shapeTree.Append(CreateTextBox(textBox, shapeId++, allowRolePlaceholder: false));
            }
        }
    }

    foreach (var image in tableOverlayImages)
    {
        if (TryCreatePicture(image, slidePart, shapeId, irDirectory, out var picture, TemplatePlaceholderWriter.Binding(placeholderBindings, "images", image.Id)))
        {
            shapeTree.Append(picture);
            shapeId++;
        }
    }

    foreach (var chart in page.Charts ?? [])
    {
        var drawingProperties = CreateNonVisualDrawingProperties(shapeId, SafeDrawingName(chart.Id, "Chart", shapeId), chart.Source);
        if (NativeChartWriter.TryCreate(chart, slidePart, shapeId, drawingProperties, out var nativeChart, TemplatePlaceholderWriter.CreateApplicationProperties(TemplatePlaceholderWriter.Binding(placeholderBindings, "charts", chart.Id))))
        {
            shapeTree.Append(nativeChart);
            shapeId++;
            continue;
        }
        foreach (var element in EditableChartFallbackWriter.Create(chart))
        {
            if (element is TextBoxIr textBox)
            {
                shapeTree.Append(CreateTextBox(textBox, shapeId++, allowRolePlaceholder: false));
            }
            else if (element is VisualElementIr visual)
            {
                shapeTree.Append(CreateShape(visual, shapeId++, boxIndex));
            }
        }
    }

    foreach (var textBox in page.TextBoxes ?? [])
    {
        if (groupedComponentIds.TextBoxIds.Contains(textBox.Id)) continue;
        var allowRolePlaceholder = !usesTemplateBindings && !IsAbsoluteOcrTextBox(textBox);
        shapeTree.Append(CreateTextBox(textBox, shapeId++, TemplatePlaceholderWriter.Binding(placeholderBindings, "textBoxes", textBox.Id), allowRolePlaceholder));
    }

    return new P.Slide(new P.CommonSlideData(shapeTree), new P.ColorMapOverride(new A.MasterColorMapping()));
}

static bool IsNativeOverlayUnderlay(VisualElementIr image)
{
    var directStrategy = GetObject(image.Source, "componentRenderStrategy");
    if (string.Equals(GetString(directStrategy, "mode"), "preserve-crop-with-native-overlays", StringComparison.OrdinalIgnoreCase))
    {
        return true;
    }
    var layer = GetObject(image.Source, "layer");
    var layerStrategy = GetObject(layer, "componentRenderStrategy");
    return string.Equals(GetString(layerStrategy, "mode"), "preserve-crop-with-native-overlays", StringComparison.OrdinalIgnoreCase);
}

static bool IsTableOverlayElement(VisualElementIr element) => IsTableOverlaySource(element.Source);

static bool IsTableOverlaySource(JsonElement? source) => GetBoolean(source, "tableOverlay") == true;

static bool IsAbsoluteOcrTextBox(TextBoxIr textBox)
    => !string.IsNullOrWhiteSpace(GetString(textBox.Source, "ocrProvider"));

static P.Shape CreateBackground(PageIr page, uint shapeId)
{
    var fill = NormalizeHex(GetString(page.Background, "fill") ?? "#FFFFFF");
    return new P.Shape(
        new P.NonVisualShapeProperties(
            new P.NonVisualDrawingProperties { Id = shapeId, Name = "background" },
            new P.NonVisualShapeDrawingProperties(new A.ShapeLocks { NoGrouping = true }),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        new P.ShapeProperties(
            new A.Transform2D(
                new A.Offset { X = 0, Y = 0 },
                new A.Extents { Cx = ToEmu(page.SlideSize.WidthPt), Cy = ToEmu(page.SlideSize.HeightPt) }
            ),
            new A.PresetGeometry { Preset = A.ShapeTypeValues.Rectangle },
            new A.SolidFill(new A.RgbColorModelHex { Val = fill }),
            new A.Outline(new A.NoFill())
        )
    );
}

static P.Shape CreateTextBox(TextBoxIr textBox, uint shapeId, PlaceholderBindingIr? placeholderBinding = null, bool allowRolePlaceholder = true)
{
    var effectiveFont = ResolveTextBoxFont(textBox);
    var opacity = TextOpacity(textBox);
    A.RunProperties CreateRunProperties(FontIr? runFont)
    {
        var sizePt = Math.Clamp(runFont?.SizePt ?? effectiveFont?.SizePt ?? 14, 1, 400);
        var color = NormalizeHex(runFont?.Color ?? effectiveFont?.Color ?? "#111111");
        var runOpacity = Math.Clamp(runFont?.Opacity ?? opacity, 0, 1);
        var properties = new A.RunProperties
        {
            FontSize = (int)Math.Round(sizePt * 100),
            Bold = string.Equals(runFont?.Weight ?? effectiveFont?.Weight, "bold", StringComparison.OrdinalIgnoreCase)
        };
        var textGradient = runFont?.Color is null ? CreateGradientFill(GetObject(textBox.Style, "textGradient")) : null;
        if (textGradient is not null)
        {
            properties.Append(textGradient);
        }
        else
        {
            var rgb = new A.RgbColorModelHex { Val = color };
            if (runOpacity < 0.999) rgb.Append(new A.Alpha { Val = ToAlpha(runOpacity) });
            properties.Append(new A.SolidFill(rgb));
        }
        var textReflection = GetObject(textBox.Style, "textReflection");
        if (textReflection is not null) properties.Append(new A.EffectList(CreateTextReflection(textReflection)));
        AppendTypeface(properties, runFont?.Family ?? effectiveFont?.Family);
        return properties;
    }
    var paragraphProperties = new A.ParagraphProperties
    {
        Alignment = TextAlignment(effectiveFont?.Align)
    };
    if (effectiveFont?.LineHeightMultiple is { } lineHeightMultiple
        && lineHeightMultiple >= 0.5 && lineHeightMultiple <= 4)
    {
        paragraphProperties.Append(new A.LineSpacing(
            new A.SpacingPercent { Val = (int)Math.Round(lineHeightMultiple * 100000) }
        ));
    }
    var applicationProperties = TemplatePlaceholderWriter.CreateApplicationProperties(placeholderBinding, allowRolePlaceholder ? textBox.Role : null);
    // A semantic role can intentionally expose this text box as a PowerPoint
    // placeholder. Explicitly disable inherited bullets so a body placeholder
    // remains visually equivalent to the source when rendered against a master
    // whose body style enables bullets by default (notably in LibreOffice).
    if (applicationProperties.GetFirstChild<P.PlaceholderShape>() is not null)
    {
        paragraphProperties.Append(new A.NoBullet());
    }
    var transform = new A.Transform2D(
        new A.Offset { X = ToEmu(textBox.Box.X), Y = ToEmu(textBox.Box.Y) },
        new A.Extents { Cx = ToEmu(textBox.Box.W), Cy = ToEmu(textBox.Box.H) }
    );
    if (Math.Abs(textBox.Rotation ?? 0) > 0.001)
    {
        transform.Rotation = ToOpenXmlAngle(textBox.Rotation!.Value);
    }

    // Older IR producers stored wrap under style while newer callers can use the
    // typed top-level property. Honor both so explicit no-wrap evidence is not lost.
    var wrap = textBox.Wrap ?? GetBoolean(textBox.Style, "wrap");
    var bodyProperties = new A.BodyProperties
    {
        Wrap = wrap == false ? A.TextWrappingValues.None : A.TextWrappingValues.Square,
        Anchor = TextAnchor(effectiveFont?.Valign),
        LeftInset = TextInset(textBox.Style, "marginLeftPt"),
        RightInset = TextInset(textBox.Style, "marginRightPt"),
        TopInset = TextInset(textBox.Style, "marginTopPt"),
        BottomInset = TextInset(textBox.Style, "marginBottomPt")
    };
    var vertical = TextVertical(GetString(textBox.Style, "vertical"));
    if (vertical is not null) bodyProperties.Vertical = vertical.Value;

    var paragraph = new A.Paragraph(paragraphProperties);
    var richRuns = (textBox.Runs ?? [])
        .Where(run => !string.IsNullOrEmpty(run.Text))
        .Take(128)
        .ToList();
    if (richRuns.Count > 0)
    {
        foreach (var run in richRuns)
        {
            paragraph.Append(new A.Run(CreateRunProperties(run.Font), new A.Text(run.Text)));
        }
    }
    else
    {
        paragraph.Append(new A.Run(CreateRunProperties(null), new A.Text(textBox.Text ?? string.Empty)));
    }

    return new P.Shape(
        new P.NonVisualShapeProperties(
            CreateNonVisualDrawingProperties(shapeId, SafeDrawingName(textBox.Id, "TextBox", shapeId), textBox.Source ?? textBox.Style),
            new P.NonVisualShapeDrawingProperties(new A.ShapeLocks { NoGrouping = true }),
            applicationProperties
        ),
        new P.ShapeProperties(
            transform,
            new A.PresetGeometry { Preset = A.ShapeTypeValues.Rectangle },
            new A.NoFill(),
            new A.Outline(new A.NoFill())
        ),
        new P.TextBody(
            bodyProperties,
            new A.ListStyle(),
            paragraph
        )
    );
}

static FontIr? ResolveTextBoxFont(TextBoxIr textBox)
{
    if (textBox.Font is not null) return textBox.Font;
    var family = GetString(textBox.Style, "fontFace") ?? GetString(textBox.Style, "fontFamily");
    var sizePt = GetNumber(textBox.Style, "sizePt") ?? GetNumber(textBox.Style, "fontSizePt");
    var weight = GetBoolean(textBox.Style, "bold") == true
        ? "bold"
        : GetString(textBox.Style, "fontWeight");
    var color = GetString(textBox.Style, "color") ?? GetString(textBox.Style, "textColor");
    var align = GetString(textBox.Style, "align") ?? GetString(textBox.Style, "textAlign");
    var valign = GetString(textBox.Style, "valign") ?? GetString(textBox.Style, "textValign");
    var lineHeight = GetNumber(textBox.Style, "lineHeightMultiple");
    if (family is null && sizePt is null && weight is null && color is null && align is null && valign is null && lineHeight is null) return null;
    return new FontIr(family, sizePt, weight, color, align, valign, lineHeight);
}

static OpenXmlElement CreateShape(VisualElementIr element, uint shapeId, IReadOnlyDictionary<string, BoxIr>? boxIndex = null)
{
    if (string.Equals(element.Type, "line", StringComparison.OrdinalIgnoreCase))
    {
        return CreateConnectionShape(element, shapeId, boxIndex);
    }
    if (IsFreeformType(element.Type)
        && (ReadFreeformPoints(element).Count >= 3 || ReadFreeformSegments(element.Style).Count > 0))
    {
        return CreateFreeformShape(element, shapeId);
    }

    return CreateAutoShape(element, shapeId);
}

static A.TextVerticalValues? TextVertical(string? value) => value?.Trim().ToLowerInvariant() switch
{
    "vert" => A.TextVerticalValues.Vertical,
    "vert270" => A.TextVerticalValues.Vertical270,
    "wordartvert" => A.TextVerticalValues.WordArtVertical,
    "eavert" => A.TextVerticalValues.EastAsianVetical,
    "mongolianvert" => A.TextVerticalValues.MongolianVertical,
    "wordartvertrtl" => A.TextVerticalValues.WordArtLeftToRight,
    _ => null
};

static (HashSet<string> TextBoxIds, HashSet<string> ImageIds) AppendGroupedShapes(
    P.ShapeTree shapeTree,
    IReadOnlyList<VisualElementIr> shapes,
    IReadOnlyList<VisualElementIr> images,
    IReadOnlyList<TextBoxIr> textBoxes,
    SlidePart slidePart,
    string irDirectory,
    ref uint shapeId,
    IReadOnlyDictionary<string, BoxIr>? boxIndex,
    bool usesTemplateBindings)
{
    var nextShapeId = shapeId;
    var groups = shapes
        .Select((element, index) => new { element, index, groupId = NativeComponentGroupId(element) })
        .Where(item => !string.IsNullOrWhiteSpace(item.groupId))
        .GroupBy(item => item.groupId!, StringComparer.Ordinal)
        .ToDictionary(group => group.Key, group => group.Select(item => item.element).ToList(), StringComparer.Ordinal);
    var groupedTextBoxes = textBoxes
        .Select((element, index) => new { element, index, groupId = NativeTextBoxComponentGroupId(element) })
        .Where(item => !string.IsNullOrWhiteSpace(item.groupId))
        .GroupBy(item => item.groupId!, StringComparer.Ordinal)
        .ToDictionary(group => group.Key, group => group.Select(item => item.element).ToList(), StringComparer.Ordinal);
    var groupedImages = images
        .Select((element, index) => new { element, index, groupId = NativeComponentGroupId(element) })
        .Where(item => !string.IsNullOrWhiteSpace(item.groupId))
        .GroupBy(item => item.groupId!, StringComparer.Ordinal)
        .ToDictionary(group => group.Key, group => group.Select(item => item.element).ToList(), StringComparer.Ordinal);
    var allGroupIds = groups.Keys
        .Concat(groupedImages.Keys)
        .Concat(groupedTextBoxes.Keys)
        .ToHashSet(StringComparer.Ordinal);
    var groupIds = allGroupIds
        .Where(groupId =>
            (groups.TryGetValue(groupId, out var shapeMembers) ? shapeMembers.Count : 0)
            + (groupedImages.TryGetValue(groupId, out var imageMembers) ? imageMembers.Count : 0)
            + (groupedTextBoxes.TryGetValue(groupId, out var textMembers) ? textMembers.Count : 0) > 1)
        .ToHashSet(StringComparer.Ordinal);
    var emittedGroups = new HashSet<string>(StringComparer.Ordinal);
    var groupedTextBoxIds = new HashSet<string>(StringComparer.Ordinal);
    var groupedImageIds = new HashSet<string>(StringComparer.Ordinal);
    void EmitGroup(string groupId)
    {
        if (!emittedGroups.Add(groupId)) return;
        groups.TryGetValue(groupId, out var shapeMembers);
        groupedImages.TryGetValue(groupId, out var imageMembers);
        groupedTextBoxes.TryGetValue(groupId, out var textMembers);
        shapeTree.Append(CreateComponentGroupShape(
            groupId,
            shapeMembers ?? [],
            imageMembers ?? [],
            textMembers ?? [],
            slidePart,
            irDirectory,
            ref nextShapeId,
            boxIndex,
            usesTemplateBindings
        ));
        foreach (var textBox in textMembers ?? []) groupedTextBoxIds.Add(textBox.Id);
        foreach (var image in imageMembers ?? []) groupedImageIds.Add(image.Id);
    }
    foreach (var shape in shapes)
    {
        var groupId = NativeComponentGroupId(shape);
        if (!string.IsNullOrWhiteSpace(groupId) && groupIds.Contains(groupId))
        {
            EmitGroup(groupId);
            continue;
        }
        shapeTree.Append(CreateShape(shape, nextShapeId++, boxIndex));
    }
    foreach (var image in images)
    {
        var groupId = NativeComponentGroupId(image);
        if (!string.IsNullOrWhiteSpace(groupId) && groupIds.Contains(groupId)) EmitGroup(groupId);
    }
    shapeId = nextShapeId;
    return (groupedTextBoxIds, groupedImageIds);
}

static P.GroupShape CreateComponentGroupShape(
    string groupId,
    IReadOnlyList<VisualElementIr> shapes,
    IReadOnlyList<VisualElementIr> images,
    IReadOnlyList<TextBoxIr> textBoxes,
    SlidePart slidePart,
    string irDirectory,
    ref uint shapeId,
    IReadOnlyDictionary<string, BoxIr>? boxIndex,
    bool usesTemplateBindings)
{
    const double groupBoundsPaddingPt = 0.1;
    var groupShapeId = shapeId++;
    var bounds = ExpandBounds(UnionBounds(shapes.Select(shape => shape.Box)
        .Concat(images.Select(image => image.Box))
        .Concat(textBoxes.Select(textBox => textBox.Box))), groupBoundsPaddingPt);
    var group = new P.GroupShape(
        new P.NonVisualGroupShapeProperties(
            new P.NonVisualDrawingProperties { Id = groupShapeId, Name = SafeDrawingName(groupId, "Group", groupShapeId) },
            new P.NonVisualGroupShapeDrawingProperties(),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        new P.GroupShapeProperties(new A.TransformGroup(
            new A.Offset { X = ToEmu(bounds.X), Y = ToEmu(bounds.Y) },
            new A.Extents { Cx = ToEmu(bounds.W), Cy = ToEmu(bounds.H) },
            new A.ChildOffset { X = ToEmu(bounds.X), Y = ToEmu(bounds.Y) },
            new A.ChildExtents { Cx = ToEmu(bounds.W), Cy = ToEmu(bounds.H) }
        ))
    );
    foreach (var shape in shapes)
    {
        group.Append(CreateShape(shape, shapeId++, boxIndex));
    }
    foreach (var image in images)
    {
        if (TryCreatePicture(image, slidePart, shapeId, irDirectory, out var picture))
        {
            group.Append(picture);
            shapeId++;
        }
    }
    foreach (var textBox in textBoxes)
    {
        group.Append(CreateTextBox(textBox, shapeId++, allowRolePlaceholder: !usesTemplateBindings));
    }
    return group;
}

static string? NativeComponentGroupId(VisualElementIr element)
{
    return GetString(element.Source, "nativeComponentGroupId");
}

static string? NativeTextBoxComponentGroupId(TextBoxIr textBox)
{
    return GetString(textBox.Source, "nativeComponentGroupId")
        ?? GetString(textBox.Style, "nativeComponentGroupId");
}

static BoxIr UnionBounds(IEnumerable<BoxIr> boxes)
{
    var bounds = boxes
        .Select(NormalizedBounds)
        .ToArray();
    if (bounds.Length == 0) return new BoxIr(0, 0, 1, 1);
    var left = bounds.Min(box => box.Left);
    var top = bounds.Min(box => box.Top);
    var right = bounds.Max(box => box.Right);
    var bottom = bounds.Max(box => box.Bottom);
    return new BoxIr(left, top, Math.Max(1, right - left), Math.Max(1, bottom - top));
}

static BoxIr ExpandBounds(BoxIr box, double paddingPt)
{
    var padding = Math.Max(0, paddingPt);
    var (Left, Top, Right, Bottom) = NormalizedBounds(box);
    return new BoxIr(
        Left - padding,
        Top - padding,
        Math.Max(1, Right - Left + (padding * 2)),
        Math.Max(1, Bottom - Top + (padding * 2))
    );
}

static (double Left, double Top, double Right, double Bottom) NormalizedBounds(BoxIr box)
{
    var right = box.X + box.W;
    var bottom = box.Y + box.H;
    return (
        Math.Min(box.X, right),
        Math.Min(box.Y, bottom),
        Math.Max(box.X, right),
        Math.Max(box.Y, bottom)
    );
}

static P.ConnectionShape CreateConnectionShape(VisualElementIr element, uint shapeId, IReadOnlyDictionary<string, BoxIr>? boxIndex)
{
    var start = ResolveAnchor(GetObject(element.Style, "startAnchor"), boxIndex, element.Box.X, element.Box.Y);
    var end = ResolveAnchor(GetObject(element.Style, "endAnchor"), boxIndex, element.Box.X + element.Box.W, element.Box.Y + element.Box.H);
    var x = Math.Min(start.X, end.X);
    var y = Math.Min(start.Y, end.Y);
    var w = SafeConnectorExtent(Math.Abs(end.X - start.X));
    var h = SafeConnectorExtent(Math.Abs(end.Y - start.Y));

    var shapeProperties = new P.ShapeProperties(
        new A.Transform2D(
            new A.Offset { X = ToEmu(x), Y = ToEmu(y) },
            new A.Extents { Cx = ToEmu(w), Cy = ToEmu(h) }
        )
        {
            HorizontalFlip = (start.X > end.X) != (GetBoolean(element.Style, "flipH") == true),
            VerticalFlip = (start.Y > end.Y) != (GetBoolean(element.Style, "flipV") == true)
        },
        new A.PresetGeometry { Preset = ConnectorGeometry(element.Style) },
        new A.NoFill(),
        CreateOutline(element.Style)
    );
    AppendEffectList(shapeProperties, element.Style);

    return new P.ConnectionShape(
        new P.NonVisualConnectionShapeProperties(
            CreateNonVisualDrawingProperties(shapeId, SafeDrawingName(element.Id, "Connector", shapeId), element.Source),
            new P.NonVisualConnectorShapeDrawingProperties(),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        shapeProperties
    );
}

static double SafeConnectorExtent(double value) => Math.Max(0.1, value);

static P.Shape CreateAutoShape(VisualElementIr element, uint shapeId)
{
    // Learned plugin components retain their Office preset in style.shapeType
    // while their generic IR type may be rect. Prefer the specific preset.
    var preset = ToShapeType(GetString(element.Style, "shapeType") ?? element.Type);
    var transform = new A.Transform2D(
        new A.Offset { X = ToEmu(element.Box.X), Y = ToEmu(element.Box.Y) },
        new A.Extents { Cx = ToEmu(element.Box.W), Cy = ToEmu(element.Box.H) }
    );
    var rotation = GetNumber(element.Style, "rotationDeg") ?? GetNumber(element.Style, "rotation") ?? GetNumber(element.Style, "rotate");
    if (Math.Abs(rotation ?? 0) > 0.001)
    {
        transform.Rotation = ToOpenXmlAngle(rotation!.Value);
    }
    transform.HorizontalFlip = GetBoolean(element.Style, "flipH") == true;
    transform.VerticalFlip = GetBoolean(element.Style, "flipV") == true;

    var shapeProperties = new P.ShapeProperties(
        transform,
        new A.PresetGeometry(CreateAdjustValueList(element, preset)) { Preset = preset }
    );

    // DrawingML arcs are open strokes. Filling them turns each segment into a pie wedge.
    shapeProperties.Append(preset == A.ShapeTypeValues.Arc ? new A.NoFill() : CreateShapeFill(element.Style));
    shapeProperties.Append(CreateOutline(element.Style));
    AppendEffectList(shapeProperties, element.Style);

    return new P.Shape(
        new P.NonVisualShapeProperties(
            CreateNonVisualDrawingProperties(shapeId, SafeDrawingName(element.Id, "Shape", shapeId), element.Source),
            new P.NonVisualShapeDrawingProperties(new A.ShapeLocks { NoGrouping = true }),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        shapeProperties
    );
}

static bool TryCreatePicture(VisualElementIr element, SlidePart slidePart, uint shapeId, string irDirectory, out P.Picture picture, PlaceholderBindingIr? placeholderBinding = null)
{
    picture = new P.Picture();
    var assetPath = element.AssetPath ?? GetString(element.Style, "assetPath") ?? GetString(element.Source, "pageImage");
    assetPath = ResolvePath(assetPath, irDirectory);
    if (string.IsNullOrWhiteSpace(assetPath) || !File.Exists(assetPath)) return false;

    var imagePart = slidePart.AddImagePart(GetImagePartType(assetPath), $"rIdImage{shapeId}");
    using (var stream = File.OpenRead(assetPath))
    {
        imagePart.FeedData(stream);
    }
    var relId = slidePart.GetIdOfPart(imagePart);

    var blipFill = new P.BlipFill(new A.Blip { Embed = relId });
    var sourceRectangle = CreateSourceRectangle(element);
    if (sourceRectangle is not null)
    {
        blipFill.Append(sourceRectangle);
    }
    blipFill.Append(new A.Stretch(new A.FillRectangle()));

    var pictureTransform = new A.Transform2D(
            new A.Offset { X = ToEmu(element.Box.X), Y = ToEmu(element.Box.Y) },
            new A.Extents { Cx = ToEmu(element.Box.W), Cy = ToEmu(element.Box.H) }
        )
    {
        HorizontalFlip = GetBoolean(element.Style, "flipH") == true,
        VerticalFlip = GetBoolean(element.Style, "flipV") == true
    };
    var pictureRotation = GetNumber(element.Style, "rotationDeg") ?? GetNumber(element.Style, "rotation") ?? GetNumber(element.Style, "rotate");
    if (Math.Abs(pictureRotation ?? 0) > 0.001)
    {
        pictureTransform.Rotation = ToOpenXmlAngle(pictureRotation!.Value);
    }
    var shapeProperties = new P.ShapeProperties(
        pictureTransform,
        new A.PresetGeometry { Preset = A.ShapeTypeValues.Rectangle }
    );
    AppendEffectList(shapeProperties, element.Style);

    picture = new P.Picture(
        new P.NonVisualPictureProperties(
            CreateNonVisualDrawingProperties(shapeId, SafeDrawingName(element.Id, "Picture", shapeId), element.Source),
            new P.NonVisualPictureDrawingProperties(new A.PictureLocks { NoChangeAspect = true }),
            TemplatePlaceholderWriter.CreateApplicationProperties(placeholderBinding)
        ),
        blipFill,
        shapeProperties
    );
    return true;
}

static A.AdjustValueList CreateAdjustValueList(VisualElementIr element, A.ShapeTypeValues preset)
{
    var adjusts = new A.AdjustValueList();
    if (preset == A.ShapeTypeValues.Arc)
    {
        foreach (var (angle, index) in GetNumberArray(element.Style, "adjustments", 2).Select((value, index) => (value, index)))
        {
            var drawingAngle = (int)Math.Round(Clamp(angle, -360, 360) * 60000);
            adjusts.Append(new A.ShapeGuide { Name = $"adj{index + 1}", Formula = $"val {drawingAngle}" });
        }
        return adjusts;
    }
    if (preset != A.ShapeTypeValues.RoundRectangle) return adjusts;

    var radiusPt = GetNumber(element.Style, "radiusPt");
    var radiusRatio = GetNumber(element.Style, "radiusRatio");
    double? radius = radiusPt;
    if (radius is null && radiusRatio is not null)
    {
        radius = Math.Min(element.Box.W, element.Box.H) * Clamp(radiusRatio.Value, 0, 0.5);
    }
    if (radius is null) return adjusts;

    var minSide = Math.Max(0.1, Math.Min(element.Box.W, element.Box.H));
    var adjust = (int)Math.Round(Clamp(radius.Value / minSide, 0, 0.5) * 100000);
    adjusts.Append(new A.ShapeGuide { Name = "adj", Formula = $"val {adjust}" });
    return adjusts;
}

static string? ResolvePath(string? file, string irDirectory)
{
    if (string.IsNullOrWhiteSpace(file)) return null;
    return Path.IsPathRooted(file) ? file : Path.GetFullPath(Path.Combine(irDirectory, file));
}

static P.Shape CreateFreeformShape(VisualElementIr element, uint shapeId)
{
    var transform = new A.Transform2D(
        new A.Offset { X = ToEmu(element.Box.X), Y = ToEmu(element.Box.Y) },
        new A.Extents { Cx = ToEmu(element.Box.W), Cy = ToEmu(element.Box.H) }
    );
    var rotation = GetNumber(element.Style, "rotationDeg") ?? GetNumber(element.Style, "rotation") ?? GetNumber(element.Style, "rotate");
    if (Math.Abs(rotation ?? 0) > 0.001)
    {
        transform.Rotation = ToOpenXmlAngle(rotation!.Value);
    }
    transform.HorizontalFlip = GetBoolean(element.Style, "flipH") == true;
    transform.VerticalFlip = GetBoolean(element.Style, "flipV") == true;

    var geometryPath = new A.Path
    {
        Width = 21600,
        Height = 21600
    };
    var points = ReadFreeformPoints(element);
    var segments = ReadFreeformSegments(element.Style);
    if (segments.Count > 0)
    {
        foreach (var segment in segments)
        {
            AppendFreeformSegment(geometryPath, segment);
        }
    }
    else
    {
        geometryPath.Append(new A.MoveTo(ToDrawingPoint(points[0])));
        foreach (var point in points.Skip(1).Take(79))
        {
            geometryPath.Append(new A.LineTo(ToDrawingPoint(point)));
        }
        if (ShouldCloseFreeform(element))
        {
            geometryPath.Append(new A.CloseShapePath());
        }
    }

    var shapeProperties = new P.ShapeProperties(
        transform,
        new A.CustomGeometry(
            new A.AdjustValueList(),
            new A.ShapeGuideList(),
            new A.AdjustHandleList(),
            new A.ConnectionSiteList(),
            new A.Rectangle { Left = "l", Top = "t", Right = "r", Bottom = "b" },
            new A.PathList(geometryPath)
        )
    );

    shapeProperties.Append(CreateShapeFill(element.Style));
    shapeProperties.Append(CreateOutline(element.Style));
    AppendEffectList(shapeProperties, element.Style);

    return new P.Shape(
        new P.NonVisualShapeProperties(
            CreateNonVisualDrawingProperties(shapeId, SafeDrawingName(element.Id, "Freeform", shapeId), element.Source),
            new P.NonVisualShapeDrawingProperties(new A.ShapeLocks { NoGrouping = true }),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        shapeProperties
    );
}

static bool IsNone(string? value)
{
    return string.Equals(value, "none", StringComparison.OrdinalIgnoreCase)
        || string.Equals(value, "transparent", StringComparison.OrdinalIgnoreCase);
}

static A.TextAlignmentTypeValues TextAlignment(string? value)
{
    return (value ?? "left").ToLowerInvariant() switch
    {
        "center" => A.TextAlignmentTypeValues.Center,
        "right" => A.TextAlignmentTypeValues.Right,
        _ => A.TextAlignmentTypeValues.Left
    };
}

static A.TextAnchoringTypeValues TextAnchor(string? value)
{
    return string.Equals(value, "middle", StringComparison.OrdinalIgnoreCase)
        || string.Equals(value, "mid", StringComparison.OrdinalIgnoreCase)
        ? A.TextAnchoringTypeValues.Center
        : A.TextAnchoringTypeValues.Top;
}

static int TextInset(JsonElement? style, string property)
{
    return ToInt32Emu(Clamp(GetNumber(style, property) ?? 0, 0, 72));
}

static double TextOpacity(TextBoxIr textBox)
{
    if (string.Equals(GetString(textBox.Style, "visibility"), "hidden", StringComparison.OrdinalIgnoreCase)) return 0;
    var styleOpacity = GetNumber(textBox.Style, "opacity");
    if (styleOpacity is not null) return Clamp(styleOpacity.Value, 0, 1);
    return Clamp(textBox.Font?.Opacity ?? 1, 0, 1);
}

static void AppendTypeface(A.RunProperties runProperties, string? family)
{
    if (string.IsNullOrWhiteSpace(family)) return;
    runProperties.Append(new A.LatinFont { Typeface = family });
    runProperties.Append(new A.EastAsianFont { Typeface = family });
    runProperties.Append(new A.ComplexScriptFont { Typeface = family });
}

static Dictionary<string, BoxIr> BuildBoxIndex(PageIr page)
{
    var result = new Dictionary<string, BoxIr>(StringComparer.OrdinalIgnoreCase);
    foreach (var element in page.Shapes ?? []) AddBox(result, element.Id, element.Box);
    foreach (var element in page.Images ?? []) AddBox(result, element.Id, element.Box);
    foreach (var element in page.Tables ?? []) AddBox(result, element.Id, element.Box);
    foreach (var textBox in page.TextBoxes ?? []) AddBox(result, textBox.Id, textBox.Box);
    return result;
}

static void AddBox(Dictionary<string, BoxIr> index, string? id, BoxIr? box)
{
    if (string.IsNullOrWhiteSpace(id) || box is null) return;
    index[id] = box;
}

static (double X, double Y) ResolveAnchor(JsonElement? anchor, IReadOnlyDictionary<string, BoxIr>? boxIndex, double fallbackX, double fallbackY)
{
    if (anchor is null || anchor.Value.ValueKind != JsonValueKind.Object || boxIndex is null)
    {
        return (fallbackX, fallbackY);
    }
    var elementId = GetString(anchor, "elementId") ?? GetString(anchor, "id");
    if (string.IsNullOrWhiteSpace(elementId) || !boxIndex.TryGetValue(elementId, out var box))
    {
        return (fallbackX, fallbackY);
    }
    var position = Clamp(GetNumber(anchor, "position") ?? 0.5, 0, 1);
    var side = (GetString(anchor, "side") ?? "center").ToLowerInvariant();
    var point = side switch
    {
        "left" => (box.X, box.Y + box.H * position),
        "right" => (box.X + box.W, box.Y + box.H * position),
        "top" => (box.X + box.W * position, box.Y),
        "bottom" => (box.X + box.W * position, box.Y + box.H),
        _ => (box.X + box.W / 2, box.Y + box.H / 2)
    };
    return (
        point.Item1 + (GetNumber(anchor, "dxPt") ?? 0),
        point.Item2 + (GetNumber(anchor, "dyPt") ?? 0)
    );
}

static double Clamp(double value, double min, double max) => Math.Max(min, Math.Min(max, value));

static A.ShapeTypeValues ConnectorGeometry(JsonElement? style)
{
    return GetString(style, "connectorType")?.ToLowerInvariant() switch
    {
        "elbow" or "elbow-2" => A.ShapeTypeValues.BentConnector2,
        "elbow-3" => A.ShapeTypeValues.BentConnector3,
        "elbow-4" => A.ShapeTypeValues.BentConnector4,
        "elbow-5" => A.ShapeTypeValues.BentConnector5,
        _ => A.ShapeTypeValues.Line
    };
}

static A.Outline CreateOutline(JsonElement? style)
{
    var stroke = GetString(style, "stroke");
    var strokeWidth = GetNumber(style, "strokeWidthPt") ?? GetNumber(style, "strokeWidth") ?? 1;
    if (string.IsNullOrWhiteSpace(stroke) || IsNone(stroke) || strokeWidth <= 0)
    {
        return new A.Outline(new A.NoFill());
    }
    var color = new A.RgbColorModelHex { Val = NormalizeHex(stroke) };
    var opacity = GetNumber(style, "opacity");
    if (opacity is not null && opacity.Value < 1)
    {
        color.Append(new A.Alpha { Val = (int)Math.Round(Clamp(opacity.Value, 0, 1) * 100000) });
    }
    var outline = new A.Outline
    {
        Width = ToLineWidth(strokeWidth)
    };
    var strokeGradient = CreateGradientFill(GetObject(style, "strokeGradient"));
    if (strokeGradient is not null)
    {
        outline.Append(strokeGradient);
    }
    else
    {
        outline.Append(new A.SolidFill(color));
    }
    AddLineDash(outline, style);
    AddLineEnds(outline, style);
    return outline;
}

static OpenXmlElement CreateShapeFill(JsonElement? style)
{
    var gradient = CreateGradientFill(GetObject(style, "gradient"));
    if (gradient is not null) return gradient;
    var fill = GetString(style, "fill");
    return string.IsNullOrWhiteSpace(fill) || IsNone(fill)
        ? new A.NoFill()
        : CreateSolidFill(fill, GetNumber(style, "opacity"));
}

static A.SolidFill CreateSolidFill(string fill, double? opacity = null)
{
    var color = new A.RgbColorModelHex { Val = NormalizeHex(fill) };
    if (opacity is not null && opacity.Value < 1)
    {
        color.Append(new A.Alpha { Val = (int)Math.Round(Clamp(opacity.Value, 0, 1) * 100000) });
    }
    return new A.SolidFill(color);
}

static A.GradientFill? CreateGradientFill(JsonElement? gradient)
{
    if (gradient is null || gradient.Value.ValueKind != JsonValueKind.Object) return null;
    if (GetString(gradient, "type") is { Length: > 0 } type
        && !string.Equals(type, "linear", StringComparison.OrdinalIgnoreCase)) return null;
    if (!gradient.Value.TryGetProperty("stops", out var stopsElement) || stopsElement.ValueKind != JsonValueKind.Array) return null;
    var stops = new List<A.GradientStop>();
    var index = 0;
    var total = Math.Max(1, stopsElement.GetArrayLength() - 1);
    foreach (var stopElement in stopsElement.EnumerateArray())
    {
        if (stopElement.ValueKind != JsonValueKind.Object) continue;
        var color = NormalizeHex(GetString(stopElement, "color") ?? "");
        var fallbackPosition = total == 0 ? 0 : (double)index / total;
        var position = NormalizeGradientPosition(GetNumber(stopElement, "position") ?? fallbackPosition);
        var gradientColor = new A.RgbColorModelHex { Val = color };
        var alpha = GetNumber(stopElement, "alpha");
        if (alpha is not null && alpha.Value < 1)
        {
            gradientColor.Append(new A.Alpha { Val = (int)Math.Round(Clamp(alpha.Value, 0, 1) * 100000) });
        }
        stops.Add(new A.GradientStop(gradientColor) { Position = position });
        index++;
        if (stops.Count >= 6) break;
    }
    if (stops.Count < 2) return null;
    var angle = ToOpenXmlAngle(GetNumber(gradient, "angleDeg") ?? 0);
    return new A.GradientFill(
        new A.GradientStopList(stops),
        new A.LinearGradientFill { Angle = angle, Scaled = false }
    )
    {
        RotateWithShape = true
    };
}

static int NormalizeGradientPosition(double value)
{
    var normalized = Math.Abs(value) <= 1 ? value * 100000 : value;
    return (int)Math.Round(Clamp(normalized, 0, 100000));
}

static void AddLineEnds(A.Outline outline, JsonElement? style)
{
    if (IsArrow(GetString(style, "startArrow")))
    {
        outline.Append(new A.HeadEnd { Type = A.LineEndValues.Triangle });
    }
    if (IsArrow(GetString(style, "endArrow")))
    {
        outline.Append(new A.TailEnd { Type = A.LineEndValues.Triangle });
    }
}

static bool IsArrow(string? value) =>
    string.Equals(value, "triangle", StringComparison.OrdinalIgnoreCase) ||
    string.Equals(value, "arrow", StringComparison.OrdinalIgnoreCase);

static void AddLineDash(A.Outline outline, JsonElement? style)
{
    var dash = GetString(style, "dash")?.ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(dash)) return;
    outline.Append(new A.PresetDash
    {
        Val = dash switch
        {
            "dot" => A.PresetLineDashValues.Dot,
            "dashdot" => A.PresetLineDashValues.DashDot,
            // DrawingML has no short DashDotDot preset; DashDot is its closest native equivalent.
            "dashdotdot" => A.PresetLineDashValues.DashDot,
            "largedash" => A.PresetLineDashValues.LargeDash,
            "largedashdot" => A.PresetLineDashValues.LargeDashDot,
            "largedashdotdot" => A.PresetLineDashValues.LargeDashDotDot,
            "systemdash" => A.PresetLineDashValues.SystemDash,
            "systemdashdot" => A.PresetLineDashValues.SystemDashDot,
            "systemdashdotdot" => A.PresetLineDashValues.SystemDashDotDot,
            _ => A.PresetLineDashValues.Dash
        }
    });
}

static bool IsFreeformType(string? type)
{
    return string.Equals(type, "freeform", StringComparison.OrdinalIgnoreCase)
        || string.Equals(type, "polyline", StringComparison.OrdinalIgnoreCase);
}

static bool ShouldCloseFreeform(VisualElementIr element)
{
    if (string.Equals(element.Type, "polyline", StringComparison.OrdinalIgnoreCase)) return false;
    var closePath = GetBoolean(element.Style, "closePath");
    return closePath ?? true;
}

static List<PointIr> ReadFreeformPoints(VisualElementIr element)
{
    if (element.Points is { Count: >= 3 })
    {
        return element.Points
            .Take(80)
            .Select(point => new PointIr(Clamp(point.X, 0, 1), Clamp(point.Y, 0, 1)))
            .ToList();
    }
    if (element.Style is null || element.Style.Value.ValueKind != JsonValueKind.Object) return [];

    var style = element.Style.Value;
    JsonElement pointsArray;
    if (style.TryGetProperty("points", out var directPoints) && directPoints.ValueKind == JsonValueKind.Array)
    {
        pointsArray = directPoints;
    }
    else if (style.TryGetProperty("freeform", out var freeform)
        && freeform.ValueKind == JsonValueKind.Object
        && freeform.TryGetProperty("points", out var nestedPoints)
        && nestedPoints.ValueKind == JsonValueKind.Array)
    {
        pointsArray = nestedPoints;
    }
    else
    {
        return [];
    }

    var points = new List<PointIr>();
    foreach (var point in pointsArray.EnumerateArray())
    {
        if (point.ValueKind != JsonValueKind.Object) continue;
        var x = GetNumber(point, "x");
        var y = GetNumber(point, "y");
        if (x is null || y is null) continue;
        points.Add(new PointIr(Clamp(x.Value, 0, 1), Clamp(y.Value, 0, 1)));
        if (points.Count >= 80) break;
    }
    return points.Count >= 3 ? points : [];
}

static A.Point ToDrawingPoint(PointIr point)
{
    return new A.Point
    {
        X = ToGeometryCoordinate(point.X).ToString(System.Globalization.CultureInfo.InvariantCulture),
        Y = ToGeometryCoordinate(point.Y).ToString(System.Globalization.CultureInfo.InvariantCulture)
    };
}

static List<FreeformSegmentIr> ReadFreeformSegments(JsonElement? style)
{
    var segments = new List<FreeformSegmentIr>();
    if (style is null || style.Value.ValueKind != JsonValueKind.Object) return segments;
    if (!style.Value.TryGetProperty("freeformSegments", out var array) || array.ValueKind != JsonValueKind.Array) return segments;
    foreach (var item in array.EnumerateArray())
    {
        if (item.ValueKind != JsonValueKind.Object) continue;
        var type = GetString(item, "type") ?? "";
        if (!IsFreeformSegmentType(type)) continue;
        var points = new List<PointIr>();
        if (item.TryGetProperty("points", out var pointsArray) && pointsArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var point in pointsArray.EnumerateArray())
            {
                if (point.ValueKind != JsonValueKind.Object) continue;
                points.Add(new PointIr(
                    Clamp(GetNumber(point, "x") ?? 0, 0, 1),
                    Clamp(GetNumber(point, "y") ?? 0, 0, 1)
                ));
                if (points.Count >= 3) break;
            }
        }
        if (string.Equals(type, "close", StringComparison.Ordinal) || points.Count > 0)
        {
            segments.Add(new FreeformSegmentIr(type, points));
        }
        if (segments.Count >= 120) break;
    }
    return segments;
}

static bool IsFreeformSegmentType(string? type)
{
    return type is "moveTo" or "lnTo" or "cubicBezTo" or "quadBezTo" or "close";
}

static void AppendFreeformSegment(A.Path path, FreeformSegmentIr segment)
{
    switch (segment.Type)
    {
        case "moveTo" when segment.Points.Count >= 1:
            path.Append(new A.MoveTo(ToDrawingPoint(segment.Points[0])));
            break;
        case "lnTo" when segment.Points.Count >= 1:
            path.Append(new A.LineTo(ToDrawingPoint(segment.Points[0])));
            break;
        case "cubicBezTo" when segment.Points.Count >= 3:
            path.Append(new A.CubicBezierCurveTo(segment.Points.Take(3).Select(ToDrawingPoint)));
            break;
        case "quadBezTo" when segment.Points.Count >= 2:
            path.Append(new A.QuadraticBezierCurveTo(segment.Points.Take(2).Select(ToDrawingPoint)));
            break;
        case "close":
            path.Append(new A.CloseShapePath());
            break;
    }
}

static int ToGeometryCoordinate(double value)
{
    return (int)Math.Round(Clamp(value, 0, 1) * 21600);
}

static void AppendEffectList(P.ShapeProperties shapeProperties, JsonElement? style)
{
    var shadow = GetObject(style, "shadow");
    if (shadow is null) return;
    shapeProperties.Append(new A.EffectList(CreateOuterShadow(shadow)));
}

static A.OuterShadow CreateOuterShadow(JsonElement? shadow)
{
    var color = NormalizeHex(GetString(shadow, "color") ?? "#000000");
    var alpha = ToAlpha(GetNumber(shadow, "alpha") ?? 0.18);
    var rgb = new A.RgbColorModelHex { Val = color };
    rgb.Append(new A.Alpha { Val = alpha });
    return new A.OuterShadow(rgb)
    {
        BlurRadius = ToEmu(GetNumber(shadow, "blurPt") ?? 4),
        Distance = ToEmu(GetNumber(shadow, "distancePt") ?? 1.5),
        Direction = (int)Math.Round((GetNumber(shadow, "angleDeg") ?? 45) * 60000),
        Alignment = A.RectangleAlignmentValues.Center,
        RotateWithShape = false
    };
}

static A.Reflection CreateTextReflection(JsonElement? reflection)
{
    return new A.Reflection
    {
        BlurRadius = ToEmu(Clamp(GetNumber(reflection, "blurPt") ?? 0, 0, 40)),
        StartOpacity = ToAlpha(Clamp(GetNumber(reflection, "startAlpha") ?? 0.6, 0, 1)),
        StartPosition = ToAlpha(Clamp(GetNumber(reflection, "startPosition") ?? 0, 0, 1)),
        EndAlpha = ToAlpha(Clamp(GetNumber(reflection, "endAlpha") ?? 0, 0, 1)),
        EndPosition = ToAlpha(Clamp(GetNumber(reflection, "endPosition") ?? 1, 0, 1)),
        Distance = ToEmu(Clamp(GetNumber(reflection, "distancePt") ?? 0, 0, 40)),
        Direction = ToOpenXmlAngle(Clamp(GetNumber(reflection, "directionDeg") ?? 90, -360, 360)),
        FadeDirection = ToOpenXmlAngle(Clamp(GetNumber(reflection, "fadeDirectionDeg") ?? 90, -360, 360)),
        HorizontalRatio = (int)Math.Round(Clamp(GetNumber(reflection, "scaleX") ?? 1, -2, 2) * 100000),
        VerticalRatio = (int)Math.Round(Clamp(GetNumber(reflection, "scaleY") ?? -1, -2, 2) * 100000),
        HorizontalSkew = ToOpenXmlAngle(Clamp(GetNumber(reflection, "skewXDeg") ?? 0, -90, 90)),
        VerticalSkew = ToOpenXmlAngle(Clamp(GetNumber(reflection, "skewYDeg") ?? 0, -90, 90)),
        Alignment = TextReflectionAlignment(GetString(reflection, "alignment")),
        RotateWithShape = GetBoolean(reflection, "rotateWithShape") == true
    };
}

static A.RectangleAlignmentValues TextReflectionAlignment(string? value)
{
    return value?.ToLowerInvariant() switch
    {
        "tl" => A.RectangleAlignmentValues.TopLeft,
        "t" => A.RectangleAlignmentValues.Top,
        "tr" => A.RectangleAlignmentValues.TopRight,
        "l" => A.RectangleAlignmentValues.Left,
        "r" => A.RectangleAlignmentValues.Right,
        "bl" => A.RectangleAlignmentValues.BottomLeft,
        "b" => A.RectangleAlignmentValues.Bottom,
        "br" => A.RectangleAlignmentValues.BottomRight,
        _ => A.RectangleAlignmentValues.Center
    };
}

static A.SourceRectangle? CreateSourceRectangle(VisualElementIr element)
{
    var crop = GetObject(element.Style, "crop")
        ?? GetObject(element.Style, "cropRect")
        ?? GetObject(element.Source, "crop")
        ?? GetObject(element.Source, "cropRect");
    if (crop is null) return null;
    return new A.SourceRectangle
    {
        Left = ToCropOffset(GetNumber(crop, "left") ?? GetNumber(crop, "l") ?? 0),
        Top = ToCropOffset(GetNumber(crop, "top") ?? GetNumber(crop, "t") ?? 0),
        Right = ToCropOffset(GetNumber(crop, "right") ?? GetNumber(crop, "r") ?? 0),
        Bottom = ToCropOffset(GetNumber(crop, "bottom") ?? GetNumber(crop, "b") ?? 0)
    };
}

static int ToAlpha(double alpha) => (int)Math.Round(Clamp(alpha, 0, 1) * 100000);

static int ToCropOffset(double value)
{
    var normalized = Math.Abs(value) <= 1 ? value * 100000 : value <= 100 ? value * 1000 : value;
    return (int)Math.Round(Clamp(normalized, 0, 100000));
}

static string SafeDrawingName(string? value, string prefix, uint shapeId)
{
    var text = string.IsNullOrWhiteSpace(value) ? $"{prefix} {shapeId}" : value.Trim();
    var builder = new StringBuilder(text.Length);
    foreach (var ch in text)
    {
        builder.Append(char.IsControl(ch) ? '_' : ch);
    }
    var safe = builder.ToString().Trim();
    return safe.Length == 0 ? $"{prefix} {shapeId}" : safe;
}

static P.NonVisualDrawingProperties CreateNonVisualDrawingProperties(uint shapeId, string name, JsonElement? metadata)
{
    var properties = new P.NonVisualDrawingProperties { Id = shapeId, Name = name };
    var description = BuildComponentReplacementDescription(metadata);
    if (!string.IsNullOrWhiteSpace(description))
    {
        properties.Description = description;
    }
    return properties;
}

static string? BuildComponentReplacementDescription(JsonElement? metadata)
{
    var plan = GetObject(metadata, "componentReplacementPlan");
    if (plan is null) return null;

    var sourceProvider = GetString(plan, "sourceProvider");
    var componentKind = GetString(plan, "componentKind");
    var componentId = GetString(plan, "componentId") ?? GetString(metadata, "componentReplacementCandidateId");
    if (string.IsNullOrWhiteSpace(sourceProvider) || string.IsNullOrWhiteSpace(componentId)) return null;

    var layerKey = GetString(plan, "layerKey") ?? GetString(metadata, "componentReplacementLayerKey");
    var tier = GetString(plan, "suitabilityTier") ?? GetString(metadata, "componentReplacementSuitabilityTier");
    var score = GetNumber(plan, "suitabilityScore") ?? GetNumber(metadata, "componentReplacementSuitabilityScore");
    var title = GetString(plan, "title");
    var motifs = GetStringArray(plan, "targetMotifs")
        .Where(value => !string.IsNullOrWhiteSpace(value))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Take(8)
        .ToList();

    var parts = new List<string>
    {
        "slideclone:componentReplacementPlan",
        $"provider={SanitizeMetadataValue(sourceProvider, 48)}",
        $"kind={SanitizeMetadataValue(componentKind ?? "component", 32)}",
        $"id={SanitizeMetadataValue(componentId, 96)}"
    };
    if (!string.IsNullOrWhiteSpace(layerKey)) parts.Add($"layer={SanitizeMetadataValue(layerKey, 48)}");
    if (!string.IsNullOrWhiteSpace(tier)) parts.Add($"tier={SanitizeMetadataValue(tier, 32)}");
    if (score is not null) parts.Add($"score={Math.Round(score.Value, 2).ToString(CultureInfo.InvariantCulture)}");
    if (!string.IsNullOrWhiteSpace(title)) parts.Add($"title={SanitizeMetadataValue(title, 96)}");
    if (motifs.Count > 0) parts.Add($"motifs={SanitizeMetadataValue(string.Join(",", motifs), 160)}");
    return string.Join(" ", parts);
}

static string SanitizeMetadataValue(string value, int maxLength)
{
    var builder = new StringBuilder(Math.Min(value.Length, maxLength));
    foreach (var ch in value)
    {
        if (builder.Length >= maxLength) break;
        builder.Append(char.IsControl(ch) || char.IsWhiteSpace(ch) ? '_' : ch);
    }
    return builder.ToString().Trim('_');
}

static long ToEmu(double point) => (long)Math.Round(point * 12700);

static int ToInt32Emu(double point) => checked((int)Math.Round(point * 12700));

static int ToLineWidth(double point) => Math.Max(0, (int)Math.Round(point * 12700));

static int ToOpenXmlAngle(double degrees) => (int)Math.Round(degrees * 60000);

static A.ShapeTypeValues ToShapeType(string? type)
{
    return (type ?? "rect").ToLowerInvariant() switch
    {
        "line" => A.ShapeTypeValues.Line,
        "arc" => A.ShapeTypeValues.Arc,
        "ellipse" or "oval" or "circle" => A.ShapeTypeValues.Ellipse,
        "roundrect" or "rounded-rect" or "roundedRectangle" or "phone" or "mobile" or "device-phone" => A.ShapeTypeValues.RoundRectangle,
        "triangle" => A.ShapeTypeValues.Triangle,
        "right-triangle" or "righttriangle" => A.ShapeTypeValues.RightTriangle,
        "wedgerectcallout" or "wedge-rect-callout" => A.ShapeTypeValues.WedgeRectangleCallout,
        "diamond" => A.ShapeTypeValues.Diamond,
        "hexagon" => A.ShapeTypeValues.Hexagon,
        "chevron" => A.ShapeTypeValues.Chevron,
        "parallelogram" => A.ShapeTypeValues.Parallelogram,
        "cylinder" or "can" => A.ShapeTypeValues.Can,
        "cloud" => A.ShapeTypeValues.Cloud,
        "document" or "flowchart-document" or "flowchartdocument" => A.ShapeTypeValues.FlowChartDocument,
        "screen" or "device-screen" or "monitor" => A.ShapeTypeValues.Frame,
        "funnel" or "filter-funnel" => A.ShapeTypeValues.Funnel,
        "donut" or "ring" => A.ShapeTypeValues.Donut,
        "gear" or "gear6" or "six-tooth-gear" => A.ShapeTypeValues.Gear6,
        "gear9" or "nine-tooth-gear" => A.ShapeTypeValues.Gear9,
        "blockArc" or "blockarc" or "block-arc" => A.ShapeTypeValues.BlockArc,
        "circularArrow" or "circulararrow" or "circular-arrow" or "cycle-arrow" => A.ShapeTypeValues.CircularArrow,
        "bentArrow" or "bentarrow" or "bent-arrow" => A.ShapeTypeValues.BentArrow,
        "leftArrow" or "leftarrow" or "left-arrow" => A.ShapeTypeValues.LeftArrow,
        "rightArrow" or "rightarrow" or "right-arrow" => A.ShapeTypeValues.RightArrow,
        "upArrow" or "uparrow" or "up-arrow" => A.ShapeTypeValues.UpArrow,
        "downArrow" or "downarrow" or "down-arrow" => A.ShapeTypeValues.DownArrow,
        "leftRightArrow" or "leftrightarrow" or "left-right-arrow" => A.ShapeTypeValues.LeftRightArrow,
        "upDownArrow" or "updownarrow" or "up-down-arrow" => A.ShapeTypeValues.UpDownArrow,
        "curvedLeftArrow" or "curvedleftarrow" or "curved-left-arrow" => A.ShapeTypeValues.CurvedLeftArrow,
        "curvedRightArrow" or "curvedrightarrow" or "curved-right-arrow" => A.ShapeTypeValues.CurvedRightArrow,
        "uturnArrow" or "uturnarrow" or "u-turn-arrow" => A.ShapeTypeValues.UTurnArrow,
        _ => A.ShapeTypeValues.Rectangle
    };
}

static PartTypeInfo GetImagePartType(string file)
{
    return Path.GetExtension(file).ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => ImagePartType.Jpeg,
        ".gif" => ImagePartType.Gif,
        ".bmp" => ImagePartType.Bmp,
        ".tif" or ".tiff" => ImagePartType.Tiff,
        _ => ImagePartType.Png
    };
}

static string NormalizeHex(string color)
{
    var value = color.Trim().TrimStart('#');
    return value.Length == 6 ? value.ToUpperInvariant() : "111111";
}

static string? GetString(JsonElement? element, string property)
{
    if (element is null || element.Value.ValueKind != JsonValueKind.Object) return null;
    return element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
        ? value.GetString()
        : null;
}

static List<string> GetStringArray(JsonElement? element, string property)
{
    if (element is null || element.Value.ValueKind != JsonValueKind.Object) return [];
    if (!element.Value.TryGetProperty(property, out var value)) return [];
    if (value.ValueKind == JsonValueKind.Array)
    {
        return value.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? "")
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .ToList();
    }
    if (value.ValueKind == JsonValueKind.String)
    {
        return (value.GetString() ?? "")
            .Split(new[] { ',', ';', '|' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(text => text.Trim())
            .Where(text => text.Length > 0)
            .ToList();
    }
    return [];
}

static List<double> GetNumberArray(JsonElement? element, string property, int maxValues)
{
    if (element is null || element.Value.ValueKind != JsonValueKind.Object) return [];
    if (!element.Value.TryGetProperty(property, out var values) || values.ValueKind != JsonValueKind.Array) return [];
    return values.EnumerateArray()
        .Where(value => value.ValueKind == JsonValueKind.Number)
        .Select(value => value.GetDouble())
        .Where(double.IsFinite)
        .Take(Math.Max(0, maxValues))
        .ToList();
}

static double? GetNumber(JsonElement? element, string property)
{
    if (element is null || element.Value.ValueKind != JsonValueKind.Object) return null;
    return element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number
        ? value.GetDouble()
        : null;
}

static bool? GetBoolean(JsonElement? element, string property)
{
    if (element is null || element.Value.ValueKind != JsonValueKind.Object) return null;
    return element.Value.TryGetProperty(property, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
        ? value.GetBoolean()
        : null;
}

static JsonElement? GetObject(JsonElement? element, string property)
{
    if (element is null || element.Value.ValueKind != JsonValueKind.Object) return null;
    return element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Object
        ? value
        : null;
}
