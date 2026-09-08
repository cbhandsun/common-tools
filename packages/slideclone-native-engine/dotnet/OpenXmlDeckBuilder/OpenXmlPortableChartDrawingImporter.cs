using System.Xml;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;

internal static class OpenXmlPortableChartDrawingImporter
{
    private const long MaximumDrawingBytes = 8L * 1024 * 1024;
    private const long MaximumImageBytes = 16L * 1024 * 1024;
    private const long MaximumTotalImageBytes = 64L * 1024 * 1024;
    private const int MaximumImages = 32;
    private const int MaximumAnchors = 256;
    private const uint MaximumImageDimension = 16_384;
    private const ulong MaximumImagePixels = 64UL * 1024 * 1024;
    private const string ChartNamespace = "http://schemas.openxmlformats.org/drawingml/2006/chart";
    private const string RelationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private const string PngContentType = "image/png";

    public static void Validate(ChartDrawingPart drawingPart)
    {
        if (drawingPart.ExternalRelationships.Any() || drawingPart.HyperlinkRelationships.Any() || drawingPart.DataPartReferenceRelationships.Any())
            throw new UnsupportedComponentException("Native chart user shapes cannot contain external, hyperlink, or media-reference relationships.");

        var children = drawingPart.Parts.ToList();
        var images = children.Where(pair => pair.OpenXmlPart is ImagePart).ToList();
        if (children.Count != images.Count)
            throw new UnsupportedComponentException("Native chart user shapes may contain only bounded PNG image parts; nested charts and unknown child parts are rejected.");
        if (images.Count > MaximumImages)
            throw new UnsupportedComponentException($"Native chart user shapes exceed the {MaximumImages}-image safety limit.");

        ValidateXml(drawingPart);
        var root = drawingPart.UserShapes
            ?? throw new UnsupportedComponentException("Native chart user shapes XML has no typed root element.");
        var all = root.Descendants().Prepend<OpenXmlElement>(root).ToList();
        var anchors = all.Count(element => element.LocalName is "absSizeAnchor" or "relSizeAnchor");
        if (anchors > MaximumAnchors)
            throw new UnsupportedComponentException($"Native chart user shapes exceed the {MaximumAnchors}-anchor safety limit.");
        if (all.Any(element => element.LocalName is "graphicFrame" or "contentPart"))
            throw new UnsupportedComponentException("Nested charts, graphic frames, and content parts are not portable chart user shapes.");
        if (all.SelectMany(element => element.GetAttributes())
            .Any(attribute => attribute.LocalName is "macro" or "textlink" && !string.IsNullOrWhiteSpace(attribute.Value)))
            throw new UnsupportedComponentException("Macros and text links are not portable chart user shapes.");

        var referencedIds = all.SelectMany(element => element.GetAttributes())
            .Where(attribute => attribute.NamespaceUri == RelationshipNamespace && !string.IsNullOrWhiteSpace(attribute.Value))
            .Select(attribute => attribute.Value)
            .ToHashSet(StringComparer.Ordinal);
        var imageIds = images.Select(pair => pair.RelationshipId).ToHashSet(StringComparer.Ordinal);
        if (!referencedIds.SetEquals(imageIds))
            throw new UnsupportedComponentException("Native chart user-shape image relationships must be resolved, referenced exactly by the drawing XML, and contain no orphans.");

        long totalImageBytes = 0;
        foreach (var pair in images)
        {
            var image = (ImagePart)pair.OpenXmlPart;
            if (!string.Equals(image.ContentType, PngContentType, StringComparison.OrdinalIgnoreCase))
                throw new UnsupportedComponentException("Portable chart user-shape images currently support only PNG content.");
            using var stream = image.GetStream(FileMode.Open, FileAccess.Read);
            if (stream.Length <= 0 || stream.Length > MaximumImageBytes)
                throw new UnsupportedComponentException("A chart user-shape PNG is empty or exceeds the 16 MiB safety limit.");
            totalImageBytes = checked(totalImageBytes + stream.Length);
            if (totalImageBytes > MaximumTotalImageBytes)
                throw new UnsupportedComponentException("Chart user-shape PNGs exceed the 64 MiB aggregate safety limit.");
            PortableImageValidator.Validate(stream, PngContentType, "A chart user-shape image", MaximumImageDimension, MaximumImagePixels);
        }
    }

    public static ChartDrawingPart Copy(ChartDrawingPart source, ChartPart targetChart, string relationshipId)
    {
        Validate(source);
        var target = targetChart.AddNewPart<ChartDrawingPart>(relationshipId);
        using (var input = source.GetStream(FileMode.Open, FileAccess.Read)) target.FeedData(input);
        foreach (var pair in source.Parts)
        {
            var image = (ImagePart)pair.OpenXmlPart;
            var targetImage = target.AddImagePart(image.ContentType, pair.RelationshipId);
            using var input = image.GetStream(FileMode.Open, FileAccess.Read);
            targetImage.FeedData(input);
        }
        return target;
    }

    private static void ValidateXml(ChartDrawingPart drawingPart)
    {
        using var stream = drawingPart.GetStream(FileMode.Open, FileAccess.Read);
        if (stream.Length <= 0 || stream.Length > MaximumDrawingBytes)
            throw new UnsupportedComponentException("Native chart user-shapes XML is empty or exceeds the 8 MiB safety limit.");
        try
        {
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersInDocument = MaximumDrawingBytes
            });
            reader.MoveToContent();
            if (reader.LocalName != "userShapes" || reader.NamespaceURI != ChartNamespace)
                throw new UnsupportedComponentException("Native chart user-shapes XML has an unexpected root element.");
            while (reader.Read()) { }
        }
        catch (XmlException)
        {
            throw new UnsupportedComponentException("Native chart user-shapes XML is malformed or unsafe.");
        }
    }

}
