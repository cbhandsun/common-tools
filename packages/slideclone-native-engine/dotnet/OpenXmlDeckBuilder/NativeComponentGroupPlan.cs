using System.Text.Json;

internal sealed record NativeComponentGroup(
    string Id,
    IReadOnlyList<VisualElementIr> Shapes,
    IReadOnlyList<VisualElementIr> Images,
    IReadOnlyList<TextBoxIr> TextBoxes);

// Membership is collected up front; emission happens at the first member in
// the caller's actual drawing stream. An image/text group must not jump over
// independent pictures or labels merely because it has no shape member.
internal sealed class NativeComponentGroupPlan
{
    private readonly IReadOnlyDictionary<string, NativeComponentGroup> groups;
    private readonly HashSet<string> emitted = new(StringComparer.Ordinal);
    private readonly IReadOnlyDictionary<string, string> outputGroups;

    private NativeComponentGroupPlan(IReadOnlyDictionary<string, NativeComponentGroup> groups, IReadOnlyDictionary<string, string> outputGroups)
    { this.groups = groups; this.outputGroups = outputGroups; }

    public static NativeComponentGroupPlan Create(
        IReadOnlyList<VisualElementIr> shapes,
        IReadOnlyList<VisualElementIr> images,
        IReadOnlyList<TextBoxIr> textBoxes,
        IReadOnlyList<OutputEditGroupIr>? outputEditGroups = null)
    {
        var outputGroups = OutputEditGroupPlan.Create(shapes, images, textBoxes, outputEditGroups);
        string? ShapeGroup(VisualElementIr item) => outputGroups.GetValueOrDefault(item.Id) ?? GroupId(item.Source);
        string? TextGroup(TextBoxIr item) => outputGroups.GetValueOrDefault(item.Id) ?? TextGroupId(item);
        var shapeGroups = shapes.Where(item => !string.IsNullOrWhiteSpace(ShapeGroup(item)))
            .GroupBy(item => ShapeGroup(item)!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.Ordinal);
        var imageGroups = images.Where(item => !string.IsNullOrWhiteSpace(ShapeGroup(item)))
            .GroupBy(item => ShapeGroup(item)!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.Ordinal);
        var textGroups = textBoxes.Where(item => !string.IsNullOrWhiteSpace(TextGroup(item)))
            .GroupBy(item => TextGroup(item)!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.Ordinal);
        var groups = new Dictionary<string, NativeComponentGroup>(StringComparer.Ordinal);
        foreach (var id in shapeGroups.Keys.Concat(imageGroups.Keys).Concat(textGroups.Keys).Distinct(StringComparer.Ordinal))
        {
            shapeGroups.TryGetValue(id, out var shapeMembers);
            imageGroups.TryGetValue(id, out var imageMembers);
            textGroups.TryGetValue(id, out var textMembers);
            if ((shapeMembers?.Count ?? 0) + (imageMembers?.Count ?? 0) + (textMembers?.Count ?? 0) > 1)
                groups.Add(id, new(id, shapeMembers ?? [], imageMembers ?? [], textMembers ?? []));
        }
        return new(groups, outputGroups);
    }

    public bool TryTake(VisualElementIr element, out NativeComponentGroup? emission)
        => TryTake(outputGroups.GetValueOrDefault(element.Id) ?? GroupId(element.Source), out emission);

    public bool TryTake(TextBoxIr element, out NativeComponentGroup? emission)
        => TryTake(outputGroups.GetValueOrDefault(element.Id) ?? TextGroupId(element), out emission);

    private bool TryTake(string? id, out NativeComponentGroup? emission)
    {
        emission = null;
        if (id is null || !groups.TryGetValue(id, out var group)) return false;
        if (emitted.Add(id)) emission = group;
        return true;
    }

    private static string? TextGroupId(TextBoxIr element)
        => GroupId(element.Source) ?? GroupId(element.Style);

    private static string? GroupId(JsonElement? source)
    {
        if (source is not { ValueKind: JsonValueKind.Object } value
            || !value.TryGetProperty("nativeComponentGroupId", out var property)
            || property.ValueKind != JsonValueKind.String) return null;
        return property.GetString();
    }

}
