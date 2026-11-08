using System.Text.Json;
using System.Text.RegularExpressions;

// Output assembly is independent of source receipts. It cannot absorb existing
// measured groups or external connector paths, even on a direct CLI build.
internal static class OutputEditGroupPlan
{
    public static IReadOnlyDictionary<string, string> Create(
        IReadOnlyList<VisualElementIr> shapes,
        IReadOnlyList<VisualElementIr> images,
        IReadOnlyList<TextBoxIr> textBoxes,
        IReadOnlyList<OutputEditGroupIr>? groups)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        if (groups is null) return result;
        if (groups.Count > 96) throw Invalid();
        var items = shapes.Concat(images).Select(item => (item.Id, item.Source, item.Style))
            .Concat(textBoxes.Select(item => (item.Id, item.Source, item.Style))).ToArray();
        if (items.Length > 10000) throw Invalid();
        var byId = new Dictionary<string, (JsonElement? Source, JsonElement? Style)>(StringComparer.Ordinal);
        var existing = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in items)
        {
            if (item.Id is null || !byId.TryAdd(item.Id, (item.Source, item.Style))) throw Invalid();
            foreach (var value in new[] { item.Source, item.Style })
            {
                if (value is not null && value.Value.ValueKind != JsonValueKind.Object) throw Invalid();
                if (Has(value, "nativeComponentGroupId"))
                {
                    var id = value!.Value.GetProperty("nativeComponentGroupId");
                    if (id.ValueKind != JsonValueKind.String) throw Invalid();
                    existing.Add(id.GetString()!);
                }
            }
        }
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var group in groups)
        {
            if (group is null || !Identifier(group.Id) || !ids.Add(group.Id) || existing.Contains(group.Id)
                || group.Members is null || group.Members.Count is < 2 or > 128) throw Invalid();
            foreach (var member in group.Members)
            {
                if (!Identifier(member) || !byId.TryGetValue(member, out var item) || !result.TryAdd(member, group.Id)) throw Invalid();
                if (Has(item.Source, "nativeComponentGroupId") || Has(item.Style, "nativeComponentGroupId")
                    || Has(item.Source, "sceneRelationId") || Has(item.Style, "startAnchor") || Has(item.Style, "endAnchor")
                    || Has(item.Source, "nativeConnectorRoute") && item.Source!.Value.GetProperty("nativeConnectorRoute").ValueKind == JsonValueKind.True)
                    throw Invalid();
            }
        }
        return result;
    }

    private static bool Has(JsonElement? value, string key)
        => value is { ValueKind: JsonValueKind.Object } data && data.TryGetProperty(key, out _);

    private static bool Identifier(string? value)
        => value is { Length: > 0 and <= 128 } && Regex.IsMatch(value, "^[-A-Za-z0-9_]+$", RegexOptions.CultureInvariant);

    private static ArgumentException Invalid() => new("Output edit grouping is invalid");
}
