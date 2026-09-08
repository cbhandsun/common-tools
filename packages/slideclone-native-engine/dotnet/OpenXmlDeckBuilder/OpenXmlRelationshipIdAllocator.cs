using DocumentFormat.OpenXml.Packaging;

internal static class OpenXmlRelationshipIdAllocator
{
    public static string Next(OpenXmlPartContainer container, string prefix, string description)
    {
        ArgumentNullException.ThrowIfNull(container);
        if (string.IsNullOrWhiteSpace(prefix) || prefix.Length > 128 || prefix.Any(character => !(char.IsAsciiLetterOrDigit(character) || character is '_' or '-')))
            throw new ArgumentException("Relationship ID prefix is invalid.", nameof(prefix));
        var existing = container.Parts.Select(pair => pair.RelationshipId).ToHashSet(StringComparer.Ordinal);
        for (var index = 1; index <= 10_000; index++)
        {
            var candidate = $"{prefix}{index}";
            if (!existing.Contains(candidate)) return candidate;
        }
        throw new UnsupportedComponentException($"The target part has no bounded relationship ID available for {description}.");
    }
}
