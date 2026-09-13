using System.Globalization;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

public static class OpenXmlComponentReplacementImporter
{
    private const long EmusPerPoint = 12700;
    private const long MaximumPptxBytes = 512L * 1024 * 1024;
    private const long MaximumImageBytes = 64L * 1024 * 1024;
    private const int MaximumOperations = 200;
    private const int MaximumShapesPerOperation = 1000;
    private const string RelationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private const string TableGraphicDataUri = "http://schemas.openxmlformats.org/drawingml/2006/table";

    public static object Apply(string planFile, string outFile, bool allowMissing, bool dryRun)
    {
        var stopwatch = Stopwatch.StartNew();
        var normalizedPlan = ValidateInputFile(planFile, ".json", 16L * 1024 * 1024, "replacement plan");
        var planDirectory = Path.GetDirectoryName(normalizedPlan)!;
        var plan = JsonSerializer.Deserialize<ComponentReplacementApplyPlan>(
            File.ReadAllText(normalizedPlan),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
        ) ?? throw new InvalidDataException("The component replacement plan is empty or invalid.");
        var sourceDeck = ResolvePlanPath(plan.Pptx, planDirectory, ".pptx", MaximumPptxBytes, "target deck");
        var targetAdmission = PptxPackageAdmissionValidator.Validate(sourceDeck, "target deck");
        var normalizedOut = Path.GetFullPath(outFile);
        if (!string.Equals(Path.GetExtension(normalizedOut), ".pptx", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("The output must be a .pptx file.", nameof(outFile));
        if (string.Equals(sourceDeck, normalizedOut, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The output PPTX must differ from the source PPTX.");

        var operations = plan.Operations ?? [];
        if (operations.Count > MaximumOperations)
            throw new InvalidDataException($"At most {MaximumOperations} replacement operations are supported.");
        var missing = operations.Count(operation => !IsReady(operation));
        if (missing > 0 && !allowMissing)
            throw new InvalidOperationException($"The plan contains {missing} operation(s) that are not ready. Use --allow-missing to skip them.");

        Directory.CreateDirectory(Path.GetDirectoryName(normalizedOut) ?? Directory.GetCurrentDirectory());
        string? workFile = null;
        try
        {
            if (!dryRun)
            {
                workFile = normalizedOut + $".tmp-{Guid.NewGuid():N}";
                File.Copy(sourceDeck, workFile, overwrite: false);
            }
            var processing = ProcessOperations(workFile ?? sourceDeck, operations, planDirectory, dryRun);
            var reports = processing.Reports;
            var blocking = reports.Where(report => report.Status is "unsupported" or "failed").ToList();
            if (blocking.Count > 0 && !allowMissing)
            {
                var reasons = string.Join("; ", blocking.Take(5).Select(report => $"{report.GroupKey}: {report.Reason}"));
                throw new InvalidOperationException($"Portable component import rejected {blocking.Count} operation(s): {reasons}");
            }
            if (!dryRun)
            {
                File.Move(workFile!, normalizedOut, overwrite: true);
                workFile = null;
            }
            return new
            {
                provider = "openxml-component-replacement-apply-v1",
                engine = "openxml",
                portability = "cross-platform",
                capabilityTier = "tier-a",
                plan = normalizedPlan,
                sourcePptx = sourceDeck,
                outFile = dryRun ? null : normalizedOut,
                dryRun,
                summary = new
                {
                    operations = reports.Count,
                    applied = reports.Count(report => report.Applied),
                    skipped = reports.Count(report => !report.Applied),
                    rejected = reports.Count(report => report.Status == "unsupported")
                },
                performance = new
                {
                    elapsedMs = stopwatch.ElapsedMilliseconds,
                    uniqueSampleDecks = processing.UniqueSampleDecks,
                    sha256Computations = processing.Sha256Computations,
                    admittedPackages = 1 + processing.UniqueSampleDecks,
                    targetPackageEntries = targetAdmission.EntryCount,
                    targetExpandedBytes = targetAdmission.ExpandedBytes
                },
                operations = reports
            };
        }
        finally
        {
            if (workFile is not null && File.Exists(workFile)) File.Delete(workFile);
        }
    }

    private static ProcessingResult ProcessOperations(
        string targetFile,
        IReadOnlyList<ComponentReplacementOperation> operations,
        string planDirectory,
        bool dryRun)
    {
        using var target = PresentationDocument.Open(targetFile, !dryRun);
        var presentationPart = target.PresentationPart
            ?? throw new InvalidDataException("The target PPTX has no presentation part.");
        var reports = new List<PortableOperationReport>();
        var sampleDocuments = new Dictionary<string, PresentationDocument>(StringComparer.OrdinalIgnoreCase);
        var sampleHashes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            foreach (var operation in operations)
            {
                if (!IsReady(operation))
                {
                    reports.Add(PortableOperationReport.Skipped(operation.GroupKey, "operation_not_ready"));
                    continue;
                }
                reports.Add(ProcessOperation(presentationPart, operation, planDirectory, dryRun, sampleDocuments, sampleHashes));
            }
        }
        finally
        {
            foreach (var document in sampleDocuments.Values) document.Dispose();
        }
        if (!dryRun)
        {
            presentationPart.Presentation.Save();
            PresentationPackageServices.Validate(target);
        }
        return new ProcessingResult(reports, sampleDocuments.Count, sampleHashes.Count);
    }

    private static PortableOperationReport ProcessOperation(
        PresentationPart targetPresentation,
        ComponentReplacementOperation operation,
        string planDirectory,
        bool dryRun,
        IDictionary<string, PresentationDocument> sampleDocuments,
        IDictionary<string, string> sampleHashes)
    {
        var operationStopwatch = Stopwatch.StartNew();
        try
        {
            var sampleFile = ResolvePlanPath(operation.Sample?.Path, planDirectory, ".pptx", MaximumPptxBytes, "component sample");
            VerifyExpectedSha256(sampleFile, operation.Sample?.Sha256, sampleHashes);
            if (!sampleDocuments.TryGetValue(sampleFile, out var sample))
            {
                if (sampleDocuments.Count >= 64) throw new InvalidDataException("A replacement plan may reference at most 64 unique component sample decks.");
                PptxPackageAdmissionValidator.Validate(sampleFile, "component sample");
                sample = PresentationDocument.Open(sampleFile, false);
                sampleDocuments.Add(sampleFile, sample);
            }
            var samplePresentation = sample.PresentationPart
                ?? throw new InvalidDataException("The component sample has no presentation part.");
            var sampleSlideIndex = operation.Sample?.RecommendedGroup?.Slide ?? 1;
            var sourceSlide = GetSlidePart(samplePresentation, sampleSlideIndex);
            var selected = SelectSourceElements(sourceSlide, operation.Sample?.RecommendedGroup);
            ValidatePortableSelection(sourceSlide, selected);
            var requiredFonts = RequiredFonts(selected);

            var targetSlides = ResolveTargetSlides(operation);
            var aggregate = new List<SlideApplyResult>();
            foreach (var slideIndex in targetSlides)
            {
                var targetSlide = GetSlidePart(targetPresentation, slideIndex);
                ValidateThemeCompatibility(sourceSlide, targetSlide, selected);
                aggregate.Add(ApplyToSlide(sourceSlide, targetSlide, selected, operation, dryRun));
            }
            var targetBounds = Union(aggregate.Select(result => result.TargetBounds).Where(bounds => bounds is not null).Cast<EmuBounds>());
            var appliedBounds = Union(aggregate.Select(result => result.AppliedBounds).Where(bounds => bounds is not null).Cast<EmuBounds>());
            return new PortableOperationReport(
                operation.GroupKey,
                dryRun ? "validated" : "applied",
                !dryRun,
                aggregate.Sum(result => result.Removed),
                aggregate.Sum(result => result.Cloned),
                sampleFile,
                operation.Sample?.RecommendedGroup?.Id,
                SelectionMode(operation.Sample?.RecommendedGroup),
                null,
                ToShapeBounds(targetBounds),
                ToShapeBounds(appliedBounds),
                BoundsIoU(targetBounds, appliedBounds),
                CenterOffsetPt(targetBounds, appliedBounds),
                "tier-a"
            )
            { ElapsedMs = operationStopwatch.ElapsedMilliseconds, RequiredFonts = requiredFonts };
        }
        catch (UnsupportedComponentException exception)
        {
            return PortableOperationReport.Unsupported(operation.GroupKey, exception.Code, exception.Message, operationStopwatch.ElapsedMilliseconds);
        }
        catch (Exception exception) when (exception is InvalidDataException or IOException or OpenXmlPackageException or ArgumentException or KeyNotFoundException)
        {
            return PortableOperationReport.Failed(operation.GroupKey, FailureCode(exception), exception.Message, operationStopwatch.ElapsedMilliseconds);
        }
    }

    private static string FailureCode(Exception exception) => exception switch
    {
        InvalidDataException => "invalid_component_data",
        OpenXmlPackageException => "invalid_openxml_package",
        IOException => "component_io_failure",
        ArgumentException => "invalid_component_argument",
        KeyNotFoundException => "missing_component_reference",
        _ => "component_import_failed"
    };

    private static IReadOnlyList<string> RequiredFonts(IReadOnlyList<OpenXmlElement> selected) => selected
        .SelectMany(ElementAndDescendants)
        .SelectMany(element => element.GetAttributes())
        .Where(attribute => attribute.LocalName == "typeface")
        .Select(attribute => attribute.Value?.Trim())
        .Where(value => !string.IsNullOrWhiteSpace(value) && !value.StartsWith('+') && value.Length <= 256)
        .Select(value => value!)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
        .Take(128)
        .ToList();

    private static SlideApplyResult ApplyToSlide(
        SlidePart sourceSlide,
        SlidePart targetSlide,
        IReadOnlyList<OpenXmlElement> selected,
        ComponentReplacementOperation operation,
        bool dryRun)
    {
        var shapeTree = targetSlide.Slide.CommonSlideData?.ShapeTree
            ?? throw new InvalidDataException("The target slide has no shape tree.");
        var anchors = FindTargetAnchors(shapeTree, operation);
        var targetBounds = (ExplicitTargetBounds(operation.Target?.Box) ?? Union(anchors.Select(GetBounds).Where(bounds => bounds is not null).Cast<EmuBounds>())) ?? throw new InvalidDataException("No target bounds could be resolved for the replacement operation.");
        var clones = selected.Select(element => element.CloneNode(true)).ToList();
        var sourceBounds = Union(clones.Select(GetBounds).Where(bounds => bounds is not null).Cast<EmuBounds>())
            ?? throw new UnsupportedComponentException("The selected component has no supported transform bounds.");
        ScaleElements(clones, sourceBounds, targetBounds);
        var appliedBounds = Union(clones.Select(GetBounds).Where(bounds => bounds is not null).Cast<EmuBounds>());
        if (dryRun) return new SlideApplyResult(anchors.Count, clones.Count, targetBounds, appliedBounds);

        RemapRelationships(sourceSlide, targetSlide, clones);
        RemapShapeIds(shapeTree, clones);
        foreach (var anchor in anchors) anchor.Remove();
        foreach (var clone in clones) shapeTree.Append(clone);
        targetSlide.Slide.Save();
        return new SlideApplyResult(anchors.Count, clones.Count, targetBounds, appliedBounds);
    }

    private static IReadOnlyList<OpenXmlElement> SelectSourceElements(SlidePart sourceSlide, ComponentReplacementRecommendedGroup? recommended)
    {
        var tree = sourceSlide.Slide.CommonSlideData?.ShapeTree
            ?? throw new InvalidDataException("The component sample slide has no shape tree.");
        var drawable = tree.ChildElements.Where(IsDrawable).ToList();
        if (recommended is not null)
        {
            var groups = drawable.OfType<P.GroupShape>().ToList();
            var byIdentity = groups.FirstOrDefault(group => MatchesIdentity(group, recommended.Id, recommended.Name));
            if (byIdentity is not null) return [byIdentity];
            if (recommended.GroupIndex is > 0 && recommended.GroupIndex <= groups.Count)
                return [groups[recommended.GroupIndex.Value - 1]];
            throw new InvalidDataException("The recommended component group was not found in the sample slide.");
        }
        if (drawable.Count == 0) throw new InvalidDataException("The component sample slide contains no drawable elements.");
        return drawable;
    }

    private static void ValidatePortableSelection(SlidePart sourceSlide, IReadOnlyList<OpenXmlElement> selected)
    {
        if (selected.Count == 0 || selected.Count > MaximumShapesPerOperation)
            throw new UnsupportedComponentException($"A portable component must contain between 1 and {MaximumShapesPerOperation} top-level elements.");
        var all = selected.SelectMany(ElementAndDescendants).ToList();
        var unsupportedFrame = all.OfType<P.GraphicFrame>().FirstOrDefault(frame => !IsPortableTableFrame(frame)
            && !OpenXmlPortableChartImporter.IsPortableFrame(sourceSlide, frame)
            && !OpenXmlPortableSmartArtImporter.IsDiagramFrame(frame));
        if (unsupportedFrame is not null)
            throw new UnsupportedComponentException("Unsupported relationship-backed graphic frames require a dedicated part-graph quality gate.");
        if (all.Any(element => element.LocalName is "oleObj" or "control" or "contentPart" or "videoFile" or "audioFile"))
            throw new UnsupportedComponentException("OLE, ActiveX, content parts, audio, and video are tier-c and cannot be imported into the production path.");
        var selectedIds = all.OfType<P.NonVisualDrawingProperties>()
            .Select(properties => properties.Id?.Value)
            .Where(value => value is not null)
            .Select(value => value!.Value)
            .ToHashSet();
        ValidateAnimationBoundary(sourceSlide, selectedIds);
        foreach (var connection in all.OfType<A.StartConnection>().Cast<OpenXmlElement>().Concat(all.OfType<A.EndConnection>()))
        {
            var id = connection.GetAttribute("id", "").Value;
            if (uint.TryParse(id, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) && !selectedIds.Contains(parsed))
                throw new UnsupportedComponentException("A connector references a shape outside the selected component.");
        }

        foreach (var smartArtFrame in all.OfType<P.GraphicFrame>().Where(OpenXmlPortableSmartArtImporter.IsDiagramFrame))
            OpenXmlPortableSmartArtImporter.Validate(sourceSlide, smartArtFrame);

        foreach (var attribute in RelationshipAttributes(all))
        {
            if (string.IsNullOrWhiteSpace(attribute.Value)) continue;
            if (sourceSlide.HyperlinkRelationships.Any(link => link.Id == attribute.Value))
                throw new UnsupportedComponentException("External hyperlinks are rejected from portable components.");
            OpenXmlPart part;
            try { part = sourceSlide.GetPartById(attribute.Value); }
            catch (ArgumentOutOfRangeException) { throw new UnsupportedComponentException($"Unresolved relationship {attribute.Value} in component XML."); }
            if (part is ImagePart imagePart)
            {
                using var imageStream = imagePart.GetStream(FileMode.Open, FileAccess.Read);
                if (imageStream.Length > MaximumImageBytes) throw new UnsupportedComponentException("A component image exceeds the 64 MiB safety limit.");
                continue;
            }
            if (part is ChartPart chartPart && OpenXmlPortableChartImporter.IsChartReference(attribute.Element))
            {
                OpenXmlPortableChartImporter.Validate(chartPart);
                continue;
            }
            if (OpenXmlPortableSmartArtImporter.IsDiagramReference(attribute.Element)
                && OpenXmlPortableSmartArtImporter.IsExpectedPart(attribute.LocalName, part))
                continue;
            throw new UnsupportedComponentException($"Relationship part {part.ContentType} is not supported by the portable importer.");
        }
    }

    private static void ValidateAnimationBoundary(SlidePart sourceSlide, IReadOnlySet<uint> selectedShapeIds)
    {
        var timing = sourceSlide.Slide.Timing;
        if (timing is null) return;
        var targets = timing.Descendants()
            .Where(element => element.LocalName is "spTgt" or "shapeTarget")
            .Select(element => element.GetAttribute("spid", "").Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();
        if (targets.Count == 0)
            throw new UnsupportedComponentException("animation_target_unresolved", "Slide animation timing cannot be safely attributed to component shapes.");
        if (targets.Any(value => uint.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var id) && selectedShapeIds.Contains(id)))
            throw new UnsupportedComponentException("animated_component_not_portable", "Animated component shapes are not supported by the portable importer.");
    }

    private static void RemapRelationships(SlidePart sourceSlide, SlidePart targetSlide, IReadOnlyList<OpenXmlElement> clones)
    {
        var mapping = new Dictionary<string, string>(StringComparer.Ordinal);
        var all = clones.SelectMany(ElementAndDescendants).ToList();
        foreach (var smartArtFrame in all.OfType<P.GraphicFrame>().Where(OpenXmlPortableSmartArtImporter.IsDiagramFrame))
        {
            var relationshipIds = OpenXmlPortableSmartArtImporter.RelationshipIds(sourceSlide, smartArtFrame).Keys.ToList();
            if (relationshipIds.All(mapping.ContainsKey)) continue;
            if (relationshipIds.Any(mapping.ContainsKey))
                throw new UnsupportedComponentException("A SmartArt relationship set partially overlaps another selected diagram.");
            foreach (var pair in OpenXmlPortableSmartArtImporter.Copy(sourceSlide, targetSlide, smartArtFrame)) mapping.Add(pair.Key, pair.Value);
        }
        foreach (var attribute in RelationshipAttributes(all))
        {
            if (mapping.TryGetValue(attribute.Value, out var existing))
            {
                attribute.Element.SetAttribute(new OpenXmlAttribute(attribute.Prefix, attribute.LocalName, attribute.NamespaceUri, existing));
                continue;
            }
            var sourcePart = sourceSlide.GetPartById(attribute.Value);
            OpenXmlPart targetPart;
            if (sourcePart is ImagePart imagePart)
            {
                var targetImage = targetSlide.AddImagePart(imagePart.ContentType);
                using (var input = imagePart.GetStream(FileMode.Open, FileAccess.Read)) targetImage.FeedData(input);
                targetPart = targetImage;
            }
            else if (sourcePart is ChartPart chartPart && OpenXmlPortableChartImporter.IsChartReference(attribute.Element))
            {
                targetPart = OpenXmlPortableChartImporter.Copy(chartPart, targetSlide);
            }
            else
            {
                throw new UnsupportedComponentException("Only validated image and native chart relationships can be remapped.");
            }
            var newId = targetSlide.GetIdOfPart(targetPart);
            mapping[attribute.Value] = newId;
            attribute.Element.SetAttribute(new OpenXmlAttribute(attribute.Prefix, attribute.LocalName, attribute.NamespaceUri, newId));
        }
    }

    private static void ValidateThemeCompatibility(
        SlidePart sourceSlide,
        SlidePart targetSlide,
        IReadOnlyList<OpenXmlElement> selected)
    {
        var all = selected.SelectMany(ElementAndDescendants).ToList();
        var usesTheme = all.OfType<A.SchemeColor>().Any()
            || all.OfType<A.TableStyleId>().Any()
            || all.OfType<P.GraphicFrame>().Any(frame => OpenXmlPortableChartImporter.IsPortableFrame(sourceSlide, frame))
            || all.OfType<P.GraphicFrame>().Any(OpenXmlPortableSmartArtImporter.IsDiagramFrame)
            || all.SelectMany(element => element.GetAttributes())
                .Any(attribute => attribute.LocalName == "typeface" && attribute.Value?.StartsWith('+') == true);
        if (!usesTheme) return;
        var sourceSignature = ThemeSignature(sourceSlide);
        var targetSignature = ThemeSignature(targetSlide);
        if (sourceSignature is null || targetSignature is null || !string.Equals(sourceSignature, targetSignature, StringComparison.Ordinal))
            throw new UnsupportedComponentException("Theme-dependent colors, fonts, or table styles require matching source and target themes to preserve visual quality.");
    }

    private static string? ThemeSignature(SlidePart slide)
    {
        var master = slide.SlideLayoutPart?.SlideMasterPart;
        var themeElements = master?.ThemePart?.Theme?.ThemeElements?.OuterXml;
        if (string.IsNullOrWhiteSpace(themeElements)) return null;
        var masterColorMap = master?.SlideMaster?.ColorMap?.OuterXml ?? "";
        var layoutColorMap = slide.SlideLayoutPart?.SlideLayout?.ColorMapOverride?.OuterXml ?? "";
        var slideColorMap = slide.Slide.ColorMapOverride?.OuterXml ?? "";
        var signature = string.Join('\n', themeElements, masterColorMap, layoutColorMap, slideColorMap);
        return Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(signature)));
    }

    private static void RemapShapeIds(P.ShapeTree targetTree, IReadOnlyList<OpenXmlElement> clones)
    {
        var next = targetTree.Descendants<P.NonVisualDrawingProperties>()
            .Select(properties => properties.Id?.Value ?? 0U)
            .DefaultIfEmpty(0U)
            .Max() + 1U;
        var mapping = new Dictionary<uint, uint>();
        foreach (var properties in clones.SelectMany(ElementAndDescendants).OfType<P.NonVisualDrawingProperties>())
        {
            var old = properties.Id?.Value ?? 0U;
            var assigned = next++;
            if (old != 0U) mapping[old] = assigned;
            properties.Id = assigned;
        }
        foreach (var connection in clones.SelectMany(ElementAndDescendants).OfType<A.StartConnection>().Cast<OpenXmlElement>()
                     .Concat(clones.SelectMany(ElementAndDescendants).OfType<A.EndConnection>()))
        {
            var current = connection.GetAttribute("id", "").Value;
            if (uint.TryParse(current, NumberStyles.None, CultureInfo.InvariantCulture, out var old) && mapping.TryGetValue(old, out var assigned))
                connection.SetAttribute(new OpenXmlAttribute("", "id", "", assigned.ToString(CultureInfo.InvariantCulture)));
        }
    }

    private static List<OpenXmlElement> FindTargetAnchors(P.ShapeTree tree, ComponentReplacementOperation operation)
    {
        var names = (operation.DrawingNames ?? []).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var result = new List<OpenXmlElement>();
        foreach (var element in tree.ChildElements.Where(IsDrawable))
        {
            var properties = element.Descendants<P.NonVisualDrawingProperties>().FirstOrDefault();
            var name = properties?.Name?.Value ?? "";
            var description = properties?.Description?.Value ?? "";
            if (names.Contains(name) || MatchesAnchorDescription(description, operation)) result.Add(element);
        }
        if (result.Count == 0 && operation.Target?.ImageIndex is > 0)
        {
            var pictures = tree.ChildElements.OfType<P.Picture>().ToList();
            if (operation.Target.ImageIndex <= pictures.Count) result.Add(pictures[operation.Target.ImageIndex.Value - 1]);
        }
        return result.Distinct().ToList();
    }

    private static bool MatchesAnchorDescription(string description, ComponentReplacementOperation operation)
    {
        if (!description.StartsWith("slideclone:componentReplacementPlan", StringComparison.Ordinal)) return false;
        return ContainsMetadata(description, "provider", operation.Provider)
            && ContainsMetadata(description, "id", operation.ComponentId)
            && (string.IsNullOrWhiteSpace(operation.Layer) || ContainsMetadata(description, "layer", operation.Layer));
    }

    private static bool ContainsMetadata(string description, string key, string? value) =>
        !string.IsNullOrWhiteSpace(value) && description.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Any(token => string.Equals(token, $"{key}={value}", StringComparison.Ordinal));

    private static bool MatchesIdentity(P.GroupShape group, string? id, string? name)
    {
        var properties = group.NonVisualGroupShapeProperties?.NonVisualDrawingProperties;
        var candidates = new[] { properties?.Name?.Value, properties?.Description?.Value, properties?.Title?.Value };
        return candidates.Any(candidate => (!string.IsNullOrWhiteSpace(id) && candidate?.Contains(id, StringComparison.OrdinalIgnoreCase) == true)
            || (!string.IsNullOrWhiteSpace(name) && candidate?.Contains(name, StringComparison.OrdinalIgnoreCase) == true));
    }

    private static void ScaleElements(IReadOnlyList<OpenXmlElement> elements, EmuBounds source, EmuBounds target)
    {
        var sx = (double)target.W / source.W;
        var sy = (double)target.H / source.H;
        foreach (var element in elements)
        {
            var bounds = GetBounds(element) ?? throw new UnsupportedComponentException("A selected element has no supported transform.");
            var transformed = new EmuBounds(
                target.X + (long)Math.Round((bounds.X - source.X) * sx),
                target.Y + (long)Math.Round((bounds.Y - source.Y) * sy),
                Math.Max(1, (long)Math.Round(bounds.W * sx)),
                Math.Max(1, (long)Math.Round(bounds.H * sy))
            );
            if (element is P.GraphicFrame frame && IsPortableTableFrame(frame)) ScaleTableGrid(frame, sx, sy);
            SetBounds(element, transformed);
        }
    }

    private static void ScaleTableGrid(P.GraphicFrame frame, double sx, double sy)
    {
        var table = frame.Graphic?.GraphicData?.GetFirstChild<A.Table>()
            ?? throw new UnsupportedComponentException("Portable table XML is incomplete.");
        foreach (var column in table.TableGrid?.Elements<A.GridColumn>() ?? [])
            column.Width = Math.Max(1, (long)Math.Round((column.Width?.Value ?? 0L) * sx));
        foreach (var row in table.Elements<A.TableRow>())
            row.Height = Math.Max(1, (long)Math.Round((row.Height?.Value ?? 0L) * sy));
    }

    private static EmuBounds? GetBounds(OpenXmlElement element)
    {
        if (element is P.GroupShape group)
        {
            var transform = group.GroupShapeProperties?.TransformGroup;
            return transform?.Offset is not null && transform.Extents is not null
                ? NewBounds(transform.Offset.X?.Value, transform.Offset.Y?.Value, transform.Extents.Cx?.Value, transform.Extents.Cy?.Value)
                : null;
        }
        var transform2D = element.Descendants<A.Transform2D>().FirstOrDefault();
        if (transform2D?.Offset is not null && transform2D.Extents is not null)
            return NewBounds(transform2D.Offset.X?.Value, transform2D.Offset.Y?.Value, transform2D.Extents.Cx?.Value, transform2D.Extents.Cy?.Value);
        if (element is P.GraphicFrame frame && frame.Transform?.Offset is not null && frame.Transform.Extents is not null)
            return NewBounds(frame.Transform.Offset.X?.Value, frame.Transform.Offset.Y?.Value, frame.Transform.Extents.Cx?.Value, frame.Transform.Extents.Cy?.Value);
        return null;
    }

    private static void SetBounds(OpenXmlElement element, EmuBounds bounds)
    {
        if (element is P.GroupShape group)
        {
            var transform = group.GroupShapeProperties?.TransformGroup ?? throw new UnsupportedComponentException("Group transform is missing.");
            transform.Offset ??= new A.Offset();
            transform.Extents ??= new A.Extents();
            transform.Offset.X = bounds.X;
            transform.Offset.Y = bounds.Y;
            transform.Extents.Cx = bounds.W;
            transform.Extents.Cy = bounds.H;
            return;
        }
        if (element is P.GraphicFrame frame)
        {
            var transform = frame.Transform ?? throw new UnsupportedComponentException("Graphic frame transform is missing.");
            transform.Offset ??= new A.Offset();
            transform.Extents ??= new A.Extents();
            transform.Offset.X = bounds.X;
            transform.Offset.Y = bounds.Y;
            transform.Extents.Cx = bounds.W;
            transform.Extents.Cy = bounds.H;
            return;
        }
        var transform2D = element.Descendants<A.Transform2D>().FirstOrDefault()
            ?? throw new UnsupportedComponentException("Element transform is missing.");
        transform2D.Offset ??= new A.Offset();
        transform2D.Extents ??= new A.Extents();
        transform2D.Offset.X = bounds.X;
        transform2D.Offset.Y = bounds.Y;
        transform2D.Extents.Cx = bounds.W;
        transform2D.Extents.Cy = bounds.H;
    }

    private static IEnumerable<RelationshipAttribute> RelationshipAttributes(IEnumerable<OpenXmlElement> elements)
    {
        foreach (var element in elements)
            foreach (var attribute in element.GetAttributes())
                if (attribute.NamespaceUri == RelationshipNamespace
                    && (attribute.LocalName is "embed" or "link" or "id"
                        || (OpenXmlPortableSmartArtImporter.IsDiagramReference(element)
                            && attribute.LocalName is "dm" or "lo" or "qs" or "cs")))
                    yield return new RelationshipAttribute(element, attribute.Prefix, attribute.LocalName, attribute.NamespaceUri, attribute.Value ?? "");
    }

    private static IEnumerable<OpenXmlElement> ElementAndDescendants(OpenXmlElement element)
    {
        yield return element;
        foreach (var descendant in element.Descendants()) yield return descendant;
    }

    private static IReadOnlyList<int> ResolveTargetSlides(ComponentReplacementOperation operation)
    {
        if (operation.Target?.Slide is > 0) return [operation.Target.Slide.Value];
        var slides = (operation.Slides ?? []).Where(index => index > 0).Distinct().Take(100).ToList();
        if (slides.Count == 0) throw new InvalidDataException("The operation has no valid target slide.");
        return slides;
    }

    private static SlidePart GetSlidePart(PresentationPart presentation, int oneBasedIndex)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(oneBasedIndex);
        var ids = presentation.Presentation.SlideIdList?.Elements<P.SlideId>().ToList() ?? [];
        if (oneBasedIndex > ids.Count) throw new InvalidDataException($"Slide {oneBasedIndex} does not exist.");
        return (SlidePart)presentation.GetPartById(ids[oneBasedIndex - 1].RelationshipId!);
    }

    private static string ResolvePlanPath(string? value, string baseDirectory, string extension, long maxBytes, string label)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Contains('\0')) throw new InvalidDataException($"The {label} path is missing or invalid.");
        var resolved = Path.GetFullPath(Path.IsPathRooted(value) ? value : Path.Combine(baseDirectory, value));
        return ValidateInputFile(resolved, extension, maxBytes, label);
    }

    private static string ValidateInputFile(string value, string extension, long maxBytes, string label)
    {
        var resolved = Path.GetFullPath(value);
        if (!string.Equals(Path.GetExtension(resolved), extension, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException($"The {label} must be a {extension} file.");
        var info = new FileInfo(resolved);
        if (!info.Exists || info.Length <= 0 || info.Length > maxBytes) throw new InvalidDataException($"The {label} does not exist, is empty, or exceeds the size limit.");
        return resolved;
    }

    private static void VerifyExpectedSha256(string file, string? expected, IDictionary<string, string> sampleHashes)
    {
        if (string.IsNullOrWhiteSpace(expected)) return;
        if (expected.Length != 64 || expected.Any(character => !Uri.IsHexDigit(character)))
            throw new InvalidDataException("The component sample SHA-256 is invalid.");
        if (!sampleHashes.TryGetValue(file, out var actual))
        {
            using var stream = File.OpenRead(file);
            actual = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
            sampleHashes.Add(file, actual);
        }
        if (!string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The component sample SHA-256 does not match the immutable learning asset.");
    }

    private static bool IsReady(ComponentReplacementOperation operation) =>
        string.Equals(operation.Status, "ready", StringComparison.OrdinalIgnoreCase) && operation.Sample is not null;
    private static bool IsDrawable(OpenXmlElement element) => element is P.Shape or P.GroupShape or P.Picture or P.ConnectionShape or P.GraphicFrame;
    private static bool IsPortableTableFrame(P.GraphicFrame frame)
    {
        var graphicData = frame.Graphic?.GraphicData;
        return graphicData is not null
            && string.Equals(graphicData.Uri?.Value, TableGraphicDataUri, StringComparison.Ordinal)
            && graphicData.Elements<A.Table>().Count() == 1
            && graphicData.ChildElements.Count == 1;
    }
    private static string SelectionMode(ComponentReplacementRecommendedGroup? group) => group is null ? "all-safe-top-level-elements" : "recommended-group";
    private static EmuBounds? ExplicitTargetBounds(ComponentReplacementBox? box) => box is null ? null : new EmuBounds(ToEmu(box.X), ToEmu(box.Y), ToEmu(box.W), ToEmu(box.H));
    private static long ToEmu(double value)
    {
        if (!double.IsFinite(value) || value < 0 || value > 1_000_000) throw new InvalidDataException("A target box contains an invalid coordinate.");
        return Math.Max(1, checked((long)Math.Round(value * EmusPerPoint)));
    }
    private static EmuBounds? NewBounds(long? x, long? y, long? w, long? h) => x is null || y is null || w is null || h is null || w <= 0 || h <= 0 ? null : new EmuBounds(x.Value, y.Value, w.Value, h.Value);
    private static EmuBounds? Union(IEnumerable<EmuBounds> values)
    {
        var list = values.ToList();
        if (list.Count == 0) return null;
        var left = list.Min(value => value.X);
        var top = list.Min(value => value.Y);
        var right = list.Max(value => value.X + value.W);
        var bottom = list.Max(value => value.Y + value.H);
        return new EmuBounds(left, top, Math.Max(1, right - left), Math.Max(1, bottom - top));
    }
    private static ShapeBounds? ToShapeBounds(EmuBounds? bounds) => bounds is null ? null : new ShapeBounds((float)(bounds.X / (double)EmusPerPoint), (float)(bounds.Y / (double)EmusPerPoint), (float)(bounds.W / (double)EmusPerPoint), (float)(bounds.H / (double)EmusPerPoint));
    private static double? BoundsIoU(EmuBounds? left, EmuBounds? right)
    {
        if (left is null || right is null) return null;
        var intersectionW = Math.Max(0, Math.Min(left.X + left.W, right.X + right.W) - Math.Max(left.X, right.X));
        var intersectionH = Math.Max(0, Math.Min(left.Y + left.H, right.Y + right.H) - Math.Max(left.Y, right.Y));
        var intersection = (double)intersectionW * intersectionH;
        var union = (double)left.W * left.H + (double)right.W * right.H - intersection;
        return union <= 0 ? 0 : intersection / union;
    }
    private static double? CenterOffsetPt(EmuBounds? left, EmuBounds? right)
    {
        if (left is null || right is null) return null;
        var dx = (left.X + left.W / 2d) - (right.X + right.W / 2d);
        var dy = (left.Y + left.H / 2d) - (right.Y + right.H / 2d);
        return Math.Sqrt(dx * dx + dy * dy) / EmusPerPoint;
    }

    private sealed record RelationshipAttribute(OpenXmlElement Element, string Prefix, string LocalName, string NamespaceUri, string Value);
    private sealed record ProcessingResult(List<PortableOperationReport> Reports, int UniqueSampleDecks, int Sha256Computations);
    private sealed record EmuBounds(long X, long Y, long W, long H);
    private sealed record SlideApplyResult(int Removed, int Cloned, EmuBounds? TargetBounds, EmuBounds? AppliedBounds);
    public sealed record PortableOperationReport(
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
        double? CenterOffsetPt,
        string CapabilityTier)
    {
        public string? ReasonCode { get; init; }
        public long ElapsedMs { get; init; }
        public IReadOnlyList<string> RequiredFonts { get; init; } = [];
        public static PortableOperationReport Skipped(string? key, string reason) => Empty(key, "skipped", reason, reason, 0);
        public static PortableOperationReport Unsupported(string? key, string code, string reason, long elapsedMs) => Empty(key, "unsupported", code, reason, elapsedMs);
        public static PortableOperationReport Failed(string? key, string code, string reason, long elapsedMs) => Empty(key, "failed", code, reason, elapsedMs);
        private static PortableOperationReport Empty(string? key, string status, string code, string reason, long elapsedMs) =>
            new(key, status, false, 0, 0, null, null, null, reason, null, null, null, null, "tier-a") { ReasonCode = code, ElapsedMs = elapsedMs };
    }
}

internal sealed class UnsupportedComponentException(string code, string message) : Exception(message)
{
    public UnsupportedComponentException(string message) : this("unsupported_component", message) { }

    public string Code { get; } = string.IsNullOrWhiteSpace(code) ? "unsupported_component" : code;
}
