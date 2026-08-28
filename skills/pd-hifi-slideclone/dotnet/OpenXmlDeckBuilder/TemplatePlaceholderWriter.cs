using P = DocumentFormat.OpenXml.Presentation;

internal static class TemplatePlaceholderWriter
{
    public static IReadOnlyDictionary<string, PlaceholderBindingIr> BuildIndex(PageIr page)
    {
        var bindings = page.Intent?.TemplatePlaceholderBindings ?? [];
        if (bindings.Count > 128) throw new InvalidOperationException("Template placeholder bindings exceed the supported limit.");
        var index = new Dictionary<string, PlaceholderBindingIr>(StringComparer.Ordinal);
        var placeholderKeys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var binding in bindings)
        {
            if (string.IsNullOrWhiteSpace(binding.ObjectId) || binding.ObjectId.Length > 256
                || binding.Collection is not ("textBoxes" or "images" or "tables" or "charts")
                || binding.PlaceholderIndex is null or < 0 or > 65535
                || PlaceholderType(binding.PlaceholderType) is null)
                throw new InvalidOperationException("Template placeholder binding is invalid.");
            var objectKey = $"{binding.Collection}:{binding.ObjectId}";
            var placeholderKey = $"{binding.PlaceholderType}:{binding.PlaceholderIndex}";
            if (!index.TryAdd(objectKey, binding) || !placeholderKeys.Add(placeholderKey))
                throw new InvalidOperationException("Template placeholder bindings must be unique.");
        }
        return index;
    }

    public static PlaceholderBindingIr? Binding(IReadOnlyDictionary<string, PlaceholderBindingIr> bindings, string collection, string objectId)
        => bindings.GetValueOrDefault($"{collection}:{objectId}");

    public static P.ApplicationNonVisualDrawingProperties CreateApplicationProperties(PlaceholderBindingIr? binding, string? fallbackRole = null)
    {
        var properties = new P.ApplicationNonVisualDrawingProperties();
        var placeholderType = PlaceholderType(binding?.PlaceholderType ?? fallbackRole);
        if (placeholderType is null) return properties;
        var placeholder = new P.PlaceholderShape { Type = placeholderType.Value };
        if (binding?.PlaceholderIndex is { } placeholderIndex) placeholder.Index = (uint)placeholderIndex;
        properties.Append(placeholder);
        return properties;
    }

    private static P.PlaceholderValues? PlaceholderType(string? role) => role?.Trim().ToLowerInvariant() switch
    {
        "title" => P.PlaceholderValues.Title,
        "ctrtitle" => P.PlaceholderValues.CenteredTitle,
        "summary" => P.PlaceholderValues.SubTitle,
        "subtitle" => P.PlaceholderValues.SubTitle,
        "obj" => P.PlaceholderValues.Object,
        "pic" => P.PlaceholderValues.Picture,
        "tbl" => P.PlaceholderValues.Table,
        "chart" => P.PlaceholderValues.Chart,
        "page-number" => P.PlaceholderValues.SlideNumber,
        "section-number" => P.PlaceholderValues.SlideNumber,
        "body" => P.PlaceholderValues.Body,
        "item-title" => P.PlaceholderValues.Body,
        "item-detail" => P.PlaceholderValues.Body,
        "takeaway" => P.PlaceholderValues.Body,
        "value" => P.PlaceholderValues.Body,
        _ => null
    };
}
