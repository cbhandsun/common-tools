using System.Runtime.CompilerServices;
using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

// Only groups constructed by NativePositionedText can delegate their ports.
// Bind to existing text, preserving the exact slide-space terminal and drawing.
internal static class PositionedTextConnectionTarget
{
    private static readonly ConditionalWeakTable<P.GroupShape, object> Owners = new();
    internal static void Register(P.GroupShape group) => Owners.Add(group, new object());

    internal static P.Shape? Resolve(P.GroupShape group, ref JsonElement anchor)
    {
        if (!Owners.TryGetValue(group, out _)) return null;
        var depth = 0;
        for (var parent = group.Parent; parent is not null; parent = parent.Parent)
        {
            if (++depth > 32) return null;
            if (parent is not P.GroupShape ancestor) continue;
            var frame = ancestor.GroupShapeProperties?.GetFirstChild<A.TransformGroup>();
            if (frame is null || (frame.Rotation?.Value ?? 0) != 0 || frame.HorizontalFlip?.Value == true
                || frame.VerticalFlip?.Value == true || frame.Offset?.X?.Value is not long ax
                || frame.Offset.Y?.Value is not long ay || frame.Extents?.Cx?.Value is not long aw
                || frame.Extents.Cy?.Value is not long ah || aw <= 0 || ah <= 0
                || frame.ChildOffset?.X?.Value != ax || frame.ChildOffset.Y?.Value != ay
                || frame.ChildExtents?.Cx?.Value != aw || frame.ChildExtents.Cy?.Value != ah) return null;
        }
        var t = group.GroupShapeProperties?.GetFirstChild<A.TransformGroup>();
        if (t is null || (t.Rotation?.Value ?? 0) != 0 || t.HorizontalFlip?.Value == true || t.VerticalFlip?.Value == true
            || t.Offset?.X?.Value is not long gx || t.Offset.Y?.Value is not long gy
            || t.Extents?.Cx?.Value is not long gw || t.Extents.Cy?.Value is not long gh || gw <= 0 || gh <= 0
            || t.ChildOffset?.X?.Value != gx || t.ChildOffset.Y?.Value != gy
            || t.ChildExtents?.Cx?.Value != gw || t.ChildExtents.Cy?.Value != gh) return null;
        var side = anchor.TryGetProperty("side", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString()?.ToLowerInvariant() : null;
        uint? index = side switch { "top" => 0U, "left" => 1U, "bottom" => 2U, "right" => 3U, _ => null };
        if (index is null || !Number(anchor, "position", .5, out var p) || p < 0 || p > 1
            || !Number(anchor, "dxPt", 0, out var dx) || !Number(anchor, "dyPt", 0, out var dy)) return null;
        NativeVisibleGapSite.Validate(anchor, index.Value);
        var x = gx + (index is 0 or 2 ? p * gw : index == 3 ? gw : 0) + dx * 12700;
        var y = gy + (index is 1 or 3 ? p * gh : index == 2 ? gh : 0) + dy * 12700;
        if (!double.IsFinite(x) || !double.IsFinite(y)) return null;
        if (!anchor.TryGetProperty("siteOffsetKind", out _) && (x < gx || y < gy || x > gx + gw || y > gy + gh)) return null;
        var children = group.Elements<P.Shape>().ToArray();
        if (children.Length is < 1 or > 512) return null;
        // Deterministic closest real text frame, with emission order as tie break.
        var child = children.Where(c => c.TextBody is not null).OrderBy(c => Distance(c, x, y)).FirstOrDefault();
        var ct = child?.ShapeProperties?.Transform2D;
        if (child is null || ct?.Offset?.X?.Value is not long cx || ct.Offset.Y?.Value is not long cy
            || ct.Extents?.Cx?.Value is not long cw || ct.Extents.Cy?.Value is not long ch || cw <= 0 || ch <= 0
            || (ct.Rotation?.Value ?? 0) != 0 || ct.HorizontalFlip?.Value == true || ct.VerticalFlip?.Value == true) return null;
        // Re-express the same point at the child's outward edge. Tangential
        // displacement is explicitly diagonal; normal gap validation stays strict.
        var childSide = x < cx ? "left" : x > cx + cw ? "right" : y < cy ? "top" : y > cy + ch ? "bottom" : side!;
        var horizontal = childSide is "left" or "right";
        var position = Math.Clamp(horizontal ? (y - cy) / ch : (x - cx) / cw, 0, 1);
        var bx = cx + (horizontal ? childSide == "right" ? cw : 0 : position * cw);
        var by = cy + (horizontal ? position * ch : childSide == "bottom" ? ch : 0);
        var data = new Dictionary<string, object> { ["side"] = childSide, ["position"] = position,
            ["dxPt"] = (x - bx) / 12700, ["dyPt"] = (y - by) / 12700 };
        if (x < cx || x > cx + cw || y < cy || y > cy + ch)
            data["siteOffsetKind"] = (horizontal ? y != by : x != bx) ? "source-visible-diagonal-gap" : "source-visible-gap";
        anchor = JsonSerializer.SerializeToElement(data);
        return child;
    }

    private static double Distance(P.Shape shape, double x, double y)
    {
        var t = shape.ShapeProperties?.Transform2D;
        if (t?.Offset?.X?.Value is not long sx || t.Offset.Y?.Value is not long sy
            || t.Extents?.Cx?.Value is not long w || t.Extents.Cy?.Value is not long h || w <= 0 || h <= 0) return double.PositiveInfinity;
        return Math.Pow(x - Math.Clamp(x, sx, sx + w), 2) + Math.Pow(y - Math.Clamp(y, sy, sy + h), 2);
    }

    private static bool Number(JsonElement value, string key, double fallback, out double number)
    {
        number = fallback;
        return !value.TryGetProperty(key, out var item) || item.ValueKind == JsonValueKind.Number
            && item.TryGetDouble(out number) && double.IsFinite(number);
    }
}
