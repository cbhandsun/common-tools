using System.Text.Json;
using DocumentFormat.OpenXml;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

// Resolve after emission: z-order, optional pictures and component groups can
// change drawing IDs. An IR index is not an Office drawing ID.
internal static class ConnectorAttachmentWriter
{
    internal static void Apply(P.ShapeTree tree, PageIr page)
    {
        var drawings = tree.Descendants<P.NonVisualDrawingProperties>()
            .Where(p => !string.IsNullOrWhiteSpace(p.Name?.Value))
            .GroupBy(p => p.Name!.Value!, StringComparer.Ordinal)
            .Where(g => g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single(), StringComparer.Ordinal);
        var elements = (page.Shapes ?? []).GroupBy(e => e.Id, StringComparer.Ordinal)
            .Where(g => g.Count() == 1).ToDictionary(g => g.Key, g => g.Single(), StringComparer.Ordinal);
        foreach (var connection in tree.Descendants<P.ConnectionShape>())
        {
            var properties = connection.NonVisualConnectionShapeProperties;
            var name = properties?.NonVisualDrawingProperties?.Name?.Value;
            if (name is null || !elements.TryGetValue(name, out var element)) continue;
            var drawing = properties?.NonVisualConnectorShapeDrawingProperties;
            if (drawing is null) continue;
            Attach(drawing, element.Style, "startAnchor", true, name, drawings);
            Attach(drawing, element.Style, "endAnchor", false, name, drawings);
        }
        NativeRelationshipAttachmentAudit.Validate(tree, page);
    }

    private static void Attach(P.NonVisualConnectorShapeDrawingProperties drawing,
        JsonElement? style, string key, bool start, string connectorName,
        IReadOnlyDictionary<string, P.NonVisualDrawingProperties> drawings)
    {
        if (style is not { ValueKind: JsonValueKind.Object } s
            || !s.TryGetProperty(key, out var anchor) || anchor.ValueKind != JsonValueKind.Object) return;
        var id = String(anchor, "elementId") ?? String(anchor, "id");
        if (id is null || id == connectorName || !drawings.TryGetValue(id, out var target)
            || target.Id?.Value is not uint targetId) return;
        var shape = target.Parent?.Parent as P.Shape;
        if (target.Parent?.Parent is P.GroupShape group)
        {
            shape = PositionedTextConnectionTarget.Resolve(group, ref anchor);
            if (shape?.NonVisualShapeProperties?.NonVisualDrawingProperties?.Id?.Value is not uint childId) return;
            targetId = childId;
        }
        var transform = shape?.ShapeProperties?.Transform2D;
        if (shape is null || transform is null || (transform.Rotation?.Value ?? 0) != 0 || transform.HorizontalFlip?.Value == true
            || transform?.VerticalFlip?.Value == true) return;
        uint? site = String(anchor, "side")?.ToLowerInvariant() switch
        {
            "top" => 0U, "left" => 1U, "bottom" => 2U, "right" => 3U, _ => null
        };
        if (site is null) return;
        NativeVisibleGapSite.Validate(anchor, site.Value);
        var preset = shape.ShapeProperties?.GetFirstChild<A.PresetGeometry>();
        if (preset?.Preset?.Value == A.ShapeTypeValues.Rectangle
            && NumberEquals(anchor, "position", 0.5) && NumberEquals(anchor, "dxPt", 0)
            && NumberEquals(anchor, "dyPt", 0))
        {
            // Preserve the existing rectangle indices, including references
            // emitted before another connector needs a custom port.
        }
        else site = CustomSite(shape, anchor, site.Value);
        if (site is null) return;
        if (start) drawing.Append(new A.StartConnection { Id = targetId, Index = site.Value });
        else drawing.Append(new A.EndConnection { Id = targetId, Index = site.Value });
    }

    private static uint? CustomSite(P.Shape shape, JsonElement anchor, uint side)
    {
        if (!Number(anchor, "position", 0.5, out var position) || position < 0 || position > 1
            || !Number(anchor, "dxPt", 0, out var dx) || !Number(anchor, "dyPt", 0, out var dy)) return null;
        var properties = shape.ShapeProperties;
        var extent = properties?.Transform2D?.Extents;
        if (properties is null || extent?.Cx?.Value is not long width || extent.Cy?.Value is not long height
            || width <= 0 || height <= 0) return null;
        var x = (side is 0 or 2 ? position * width : side == 3 ? width : 0) + dx * 12700;
        var y = (side is 1 or 3 ? position * height : side == 2 ? height : 0) + dy * 12700;
        var visibleGap = NativeVisibleGapSite.Read(anchor, side, dx, dy);
        if (!double.IsFinite(x) || !double.IsFinite(y)
            || !visibleGap && (x < 0 || y < 0 || x > width || y > height)) return null;
        var geometry = properties.GetFirstChild<A.CustomGeometry>();
        if (geometry is null)
        {
            var preset = properties.GetFirstChild<A.PresetGeometry>();
            if (preset?.Preset?.Value != A.ShapeTypeValues.Rectangle) return null;
            geometry = RectangleGeometry();
            properties.ReplaceChild(geometry, preset);
        }
        var guides = geometry.GetFirstChild<A.ShapeGuideList>();
        var sites = geometry.GetFirstChild<A.ConnectionSiteList>();
        if (guides is null || sites is null) return null;
        var roundedX = (long)Math.Round(x);
        var roundedY = (long)Math.Round(y);
        // Guide identifiers are symbolic names, not arithmetic expressions.
        // Encode the sign in the name while keeping signed formula operands.
        var xName = roundedX == 0 ? "l" : roundedX == width ? "r" : roundedX * 2 == width ? "hc" : PortName("X", roundedX);
        var yName = roundedY == 0 ? "t" : roundedY == height ? "b" : roundedY * 2 == height ? "vc" : PortName("Y", roundedY);
        var angle = side switch { 0 => "16200000", 1 => "10800000", 2 => "5400000", _ => "0" };
        var existing = sites.Elements<A.ConnectionSite>().ToArray();
        for (var index = 0; index < existing.Length; index++)
            if (existing[index].Position?.X?.Value == xName && existing[index].Position?.Y?.Value == yName
                && existing[index].Angle?.Value == angle) return (uint)index;
        // Keep the independent 64-site writer bound for all IR callers,
        // including scenes with two bounded relation proposal batches.
        if (existing.Length >= 64) return null;
        var xFormula = $"*/ w {roundedX} {width}";
        var yFormula = $"*/ h {roundedY} {height}";
        if (!GuideCompatible(guides, xName, xFormula) || !GuideCompatible(guides, yName, yFormula)) return null;
        AddGuide(guides, xName, xFormula);
        AddGuide(guides, yName, yFormula);
        sites.Append(new A.ConnectionSite(new A.Position { X = xName, Y = yName }) { Angle = angle });
        return (uint)existing.Length;
    }

    private static string PortName(string axis, long value) => value < 0 ? $"ctPort{axis}n{-value}" : $"ctPort{axis}p{value}";

    private static A.CustomGeometry RectangleGeometry() => new(
        new A.AdjustValueList(), new A.ShapeGuideList(), new A.AdjustHandleList(),
        new A.ConnectionSiteList(
            new A.ConnectionSite(new A.Position { X = "hc", Y = "t" }) { Angle = "16200000" },
            new A.ConnectionSite(new A.Position { X = "l", Y = "vc" }) { Angle = "10800000" },
            new A.ConnectionSite(new A.Position { X = "hc", Y = "b" }) { Angle = "5400000" },
            new A.ConnectionSite(new A.Position { X = "r", Y = "vc" }) { Angle = "0" }),
        new A.Rectangle { Left = "l", Top = "t", Right = "r", Bottom = "b" },
        new A.PathList(new A.Path(
            new A.MoveTo(new A.Point { X = "0", Y = "0" }),
            new A.LineTo(new A.Point { X = "21600", Y = "0" }),
            new A.LineTo(new A.Point { X = "21600", Y = "21600" }),
            new A.LineTo(new A.Point { X = "0", Y = "21600" }), new A.CloseShapePath()) { Width = 21600, Height = 21600 }));

    private static bool GuideCompatible(A.ShapeGuideList guides, string name, string formula)
    {
        if (!name.StartsWith("ctPort", StringComparison.Ordinal)) return true;
        var matches = guides.Elements<A.ShapeGuide>().Where(g => g.Name?.Value == name).ToArray();
        return matches.Length == 0 || matches.Length == 1 && matches[0].Formula?.Value == formula;
    }

    private static void AddGuide(A.ShapeGuideList guides, string name, string formula)
    {
        if (name.StartsWith("ctPort", StringComparison.Ordinal) && !guides.Elements<A.ShapeGuide>().Any(g => g.Name?.Value == name))
            guides.Append(new A.ShapeGuide { Name = name, Formula = formula });
    }

    private static bool Number(JsonElement value, string key, double fallback, out double number)
    {
        number = fallback;
        return !value.TryGetProperty(key, out var item)
            || item.ValueKind == JsonValueKind.Number && item.TryGetDouble(out number) && double.IsFinite(number);
    }

    private static string? String(JsonElement value, string key)
        => value.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.String ? item.GetString() : null;

    private static bool NumberEquals(JsonElement value, string key, double expected)
        => !value.TryGetProperty(key, out var item)
            || (item.ValueKind == JsonValueKind.Number && item.TryGetDouble(out var number)
                && double.IsFinite(number) && number == expected);
}
