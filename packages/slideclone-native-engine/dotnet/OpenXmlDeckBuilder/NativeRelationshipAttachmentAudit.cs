using System.Text.Json;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

// An explicitly complete native relationship must survive actual emission.
// Source metadata requests this stricter output contract; it supplies no source
// ownership, pixel-erasure permission or proof of Office editing behavior.
internal static class NativeRelationshipAttachmentAudit
{
    internal static void Validate(P.ShapeTree tree, PageIr page)
    {
        var shapes = page.Shapes ?? [];
        var claimed = shapes.Where(shape => Complete(shape.Source)).ToArray();
        if (claimed.Length == 0) return;
        var relationCounts = shapes.Concat(page.Images ?? []).Select(shape => shape.Source)
            .Concat((page.TextBoxes ?? []).Select(text => text.Source))
            .Select(source => Property(source, "sceneRelationId"))
            .Where(value => value is { ValueKind: JsonValueKind.String })
            .GroupBy(value => value!.Value.GetString()!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var drawings = tree.Descendants<P.NonVisualDrawingProperties>()
            .Where(drawing => drawing.Id?.Value is not null)
            .GroupBy(drawing => drawing.Id!.Value)
            .Where(group => group.Count() == 1).ToDictionary(group => group.Key, group => group.Single());
        var connections = tree.Descendants<P.ConnectionShape>()
            .GroupBy(connection => connection.NonVisualConnectionShapeProperties?.NonVisualDrawingProperties?.Name?.Value ?? "", StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        foreach (var shape in claimed)
        {
            var relation = Property(shape.Source, "sceneRelationId");
            if (relation is not { ValueKind: JsonValueKind.String } || string.IsNullOrWhiteSpace(relation.Value.GetString())) throw Invalid();
            var id = relation.Value.GetString();
            if (relationCounts[id!] != 1 || !connections.TryGetValue(shape.Id, out var found) || found.Length != 1) throw Invalid();
            var properties = found[0].NonVisualConnectionShapeProperties;
            var connectorId = properties?.NonVisualDrawingProperties?.Id?.Value;
            var references = properties?.NonVisualConnectorShapeDrawingProperties;
            var starts = references?.Elements<A.StartConnection>().ToArray() ?? [];
            var ends = references?.Elements<A.EndConnection>().ToArray() ?? [];
            if (starts.Length != 1 || ends.Length != 1
                || !Valid(starts[0].Id?.Value, starts[0].Index?.Value, connectorId, drawings)
                || !Valid(ends[0].Id?.Value, ends[0].Index?.Value, connectorId, drawings)) throw Invalid();
        }
    }

    private static bool Valid(uint? id, uint? index, uint? connectorId, IReadOnlyDictionary<uint, P.NonVisualDrawingProperties> drawings)
    {
        if (id is null || index is null || id == connectorId || !drawings.TryGetValue(id.Value, out var target)
            || target.Parent?.Parent is not P.Shape shape) return false;
        var properties = shape.ShapeProperties;
        var custom = properties?.GetFirstChild<A.CustomGeometry>();
        if (custom is not null) return index < custom.GetFirstChild<A.ConnectionSiteList>()?.Elements<A.ConnectionSite>().Count();
        return properties?.GetFirstChild<A.PresetGeometry>()?.Preset?.Value == A.ShapeTypeValues.Rectangle && index < 4;
    }

    private static bool Complete(JsonElement? source)
        => Property(source, "sceneRelationId") is not null && (WholeRoute(source) || DirectConnection(source));

    private static bool WholeRoute(JsonElement? source)
        => Property(source, "nativeConnectorRoute") is { ValueKind: JsonValueKind.True }
            && Property(source, "sourceRouteParts") is { ValueKind: JsonValueKind.Number } parts
            && parts.TryGetInt32(out var count) && count == 1;

    private static bool DirectConnection(JsonElement? source)
        => Property(source, "semanticNativeStructure") is { ValueKind: JsonValueKind.True }
            && Property(source, "role") is { ValueKind: JsonValueKind.String } role && role.GetString() == "relationship"
            && Property(source, "sourceAttachmentKind") is { ValueKind: JsonValueKind.String } kind
            && kind.GetString() is "visible-gap-logical" or "source-body-contact";

    private static JsonElement? Property(JsonElement? source, string key)
        => source is { ValueKind: JsonValueKind.Object } value && value.TryGetProperty(key, out var property) ? property : null;

    private static ArgumentException Invalid() => new("Native relationship attachments are invalid");
}
