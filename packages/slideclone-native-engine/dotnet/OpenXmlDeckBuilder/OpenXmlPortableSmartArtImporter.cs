using System.Xml;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using P = DocumentFormat.OpenXml.Presentation;

internal static class OpenXmlPortableSmartArtImporter
{
    private const long MaximumDataBytes = 16L * 1024 * 1024;
    private const long MaximumDefinitionBytes = 8L * 1024 * 1024;
    private const long MaximumDrawingBytes = 16L * 1024 * 1024;
    private const long MaximumImageBytes = 16L * 1024 * 1024;
    private const long MaximumTotalImageBytes = 64L * 1024 * 1024;
    private const int MaximumImages = 16;
    private const int MaximumImageDimension = 16_384;
    private const long MaximumImagePixels = 64L * 1024 * 1024;
    private const string DiagramGraphicDataUri = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
    private const string DiagramNamespace = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
    private const string RelationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private const string DiagramDrawingNamespace = "http://schemas.microsoft.com/office/drawing/2008/diagram";

    private static readonly string[] RelationshipNames = ["dm", "lo", "qs", "cs"];

    public static bool IsPortableFrame(SlidePart sourceSlide, P.GraphicFrame frame)
    {
        try
        {
            _ = Resolve(sourceSlide, frame);
            return true;
        }
        catch (UnsupportedComponentException)
        {
            return false;
        }
    }

    public static bool IsDiagramFrame(P.GraphicFrame frame)
    {
        var graphicData = frame.Graphic?.GraphicData;
        return graphicData is not null
            && string.Equals(graphicData.Uri?.Value, DiagramGraphicDataUri, StringComparison.Ordinal)
            && graphicData.ChildElements.Count == 1
            && IsDiagramReference(graphicData.ChildElements[0]);
    }

    public static bool IsDiagramReference(OpenXmlElement element) =>
        element.LocalName == "relIds" && element.NamespaceUri == DiagramNamespace;

    public static bool IsExpectedPart(string relationshipName, OpenXmlPart part) => relationshipName switch
    {
        "dm" => part is DiagramDataPart,
        "lo" => part is DiagramLayoutDefinitionPart,
        "qs" => part is DiagramStylePart,
        "cs" => part is DiagramColorsPart,
        _ => false
    };

    public static IReadOnlyDictionary<string, string> RelationshipIds(SlidePart sourceSlide, P.GraphicFrame frame) =>
        Resolve(sourceSlide, frame).ToDictionary(item => item.RelationshipId, item => item.RelationshipName, StringComparer.Ordinal);

    public static void Validate(SlidePart sourceSlide, P.GraphicFrame frame)
    {
        var items = Resolve(sourceSlide, frame);
        var uniqueImages = new Dictionary<Uri, ImagePart>();
        long totalImageBytes = 0;
        foreach (var item in items)
        {
            var (rootName, maximumBytes, description) = item.RelationshipName switch
            {
                "dm" => ("dataModel", MaximumDataBytes, "data"),
                "lo" => ("layoutDef", MaximumDefinitionBytes, "layout definition"),
                "qs" => ("styleDef", MaximumDefinitionBytes, "style"),
                "cs" => ("colorsDef", MaximumDefinitionBytes, "colors"),
                "dr" => ("drawing", MaximumDrawingBytes, "persisted drawing"),
                _ => throw new UnsupportedComponentException("A SmartArt relationship changed after validation.")
            };
            var allowsImages = item.RelationshipName is "dm" or "lo" or "dr";
            var referencedIds = ValidateXmlPart(item.Part, rootName, item.RelationshipName == "dr" ? DiagramDrawingNamespace : DiagramNamespace, maximumBytes, description, allowsImages);
            var children = item.Part.Parts.ToList();
            if (children.Any(pair => pair.OpenXmlPart is not ImagePart) || (!allowsImages && children.Count > 0))
                throw new UnsupportedComponentException($"SmartArt {description} contains an unsupported child part.");
            var imageIds = children.Select(pair => pair.RelationshipId).ToHashSet(StringComparer.Ordinal);
            if (!referencedIds.SetEquals(imageIds))
                throw new UnsupportedComponentException($"SmartArt {description} contains an unresolved or orphan image relationship.");
            foreach (var child in children)
            {
                var image = (ImagePart)child.OpenXmlPart;
                if (!uniqueImages.TryAdd(image.Uri, image)) continue;
                if (uniqueImages.Count > MaximumImages)
                    throw new UnsupportedComponentException($"SmartArt may contain at most {MaximumImages} unique images.");
                using var stream = image.GetStream(FileMode.Open, FileAccess.Read);
                if (stream.Length <= 0 || stream.Length > MaximumImageBytes)
                    throw new UnsupportedComponentException("A SmartArt image is empty or exceeds the 16 MiB safety limit.");
                totalImageBytes = checked(totalImageBytes + stream.Length);
                if (totalImageBytes > MaximumTotalImageBytes)
                    throw new UnsupportedComponentException("SmartArt images exceed the 64 MiB aggregate safety limit.");
                using var buffer = new MemoryStream(checked((int)stream.Length));
                stream.CopyTo(buffer);
                buffer.Position = 0;
                PortableImageValidator.Validate(buffer, image.ContentType, "A SmartArt image", MaximumImageDimension, (ulong)MaximumImagePixels);
            }
        }
    }

    public static IReadOnlyDictionary<string, string> Copy(SlidePart sourceSlide, SlidePart targetSlide, P.GraphicFrame frame)
    {
        Validate(sourceSlide, frame);
        var mapping = new Dictionary<string, string>(StringComparer.Ordinal);
        var items = Resolve(sourceSlide, frame);
        var relationshipIds = items.ToDictionary(item => item.RelationshipName, item =>
            OpenXmlRelationshipIdAllocator.Next(targetSlide, $"rIdImportedSmartArt{item.RelationshipName.ToUpperInvariant()}", "imported SmartArt"), StringComparer.Ordinal);
        var targetParts = new Dictionary<string, OpenXmlPart>(StringComparer.Ordinal);
        foreach (var item in items)
        {
            var newRelationshipId = relationshipIds[item.RelationshipName];
            OpenXmlPart targetPart = item.Part switch
            {
                DiagramDataPart => targetSlide.AddNewPart<DiagramDataPart>(newRelationshipId),
                DiagramLayoutDefinitionPart => targetSlide.AddNewPart<DiagramLayoutDefinitionPart>(newRelationshipId),
                DiagramStylePart => targetSlide.AddNewPart<DiagramStylePart>(newRelationshipId),
                DiagramColorsPart => targetSlide.AddNewPart<DiagramColorsPart>(newRelationshipId),
                DiagramPersistLayoutPart => targetSlide.AddNewPart<DiagramPersistLayoutPart>(newRelationshipId),
                _ => throw new UnsupportedComponentException("A SmartArt part changed after validation.")
            };
            if (item.Part is DiagramDataPart)
                CopyDataWithRemappedPersistRelationship(item.Part, targetPart, relationshipIds["dr"]);
            else
            {
                using var input = item.Part.GetStream(FileMode.Open, FileAccess.Read);
                targetPart.FeedData(input);
            }
            targetParts.Add(item.RelationshipName, targetPart);
            mapping.Add(item.RelationshipId, newRelationshipId);
        }
        var copiedImages = new Dictionary<Uri, ImagePart>();
        foreach (var item in items)
            foreach (var child in item.Part.Parts)
            {
                var sourceImage = (ImagePart)child.OpenXmlPart;
                var targetParent = targetParts[item.RelationshipName];
                if (!copiedImages.TryGetValue(sourceImage.Uri, out var targetImage))
                {
                    targetImage = targetParent.AddNewPart<ImagePart>(sourceImage.ContentType, child.RelationshipId);
                    using var input = sourceImage.GetStream(FileMode.Open, FileAccess.Read);
                    targetImage.FeedData(input);
                    copiedImages.Add(sourceImage.Uri, targetImage);
                }
                else
                {
                    targetParent.AddPart(targetImage, child.RelationshipId);
                }
            }
        return mapping;
    }

    private static IReadOnlyList<SmartArtPartReference> Resolve(SlidePart sourceSlide, P.GraphicFrame frame)
    {
        var graphicData = frame.Graphic?.GraphicData;
        if (graphicData is null || !IsDiagramFrame(frame))
            throw new UnsupportedComponentException("A portable SmartArt frame must contain exactly one diagram relationship set.");
        var relIds = graphicData.ChildElements[0];
        var relationshipAttributes = relIds.GetAttributes()
            .Where(attribute => attribute.NamespaceUri == RelationshipNamespace)
            .ToList();
        if (relationshipAttributes.Count != RelationshipNames.Length
            || relationshipAttributes.Any(attribute => !RelationshipNames.Contains(attribute.LocalName, StringComparer.Ordinal))
            || RelationshipNames.Any(name => relationshipAttributes.Count(attribute => attribute.LocalName == name) != 1))
            throw new UnsupportedComponentException("A portable SmartArt frame requires exactly one dm, lo, qs, and cs relationship.");

        var result = new List<SmartArtPartReference>(RelationshipNames.Length);
        foreach (var relationshipName in RelationshipNames)
        {
            var relationshipId = relationshipAttributes.Single(attribute => attribute.LocalName == relationshipName).Value;
            if (string.IsNullOrWhiteSpace(relationshipId))
                throw new UnsupportedComponentException("A SmartArt relationship ID is empty.");
            OpenXmlPart part;
            try { part = sourceSlide.GetPartById(relationshipId); }
            catch (ArgumentOutOfRangeException) { throw new UnsupportedComponentException($"Unresolved SmartArt relationship {relationshipId}."); }
            if (!IsExpectedPart(relationshipName, part))
                throw new UnsupportedComponentException($"SmartArt relationship {relationshipName} resolves to an unexpected part type.");
            result.Add(new SmartArtPartReference(relationshipName, relationshipId, part));
        }
        if (result.Select(item => item.RelationshipId).Distinct(StringComparer.Ordinal).Count() != RelationshipNames.Length)
            throw new UnsupportedComponentException("SmartArt dm, lo, qs, and cs relationships must resolve to four distinct parts.");
        var dataPart = (DiagramDataPart)result.Single(item => item.RelationshipName == "dm").Part;
        var persistRelationshipId = ReadPersistRelationshipId(dataPart);
        OpenXmlPart persistPart;
        try { persistPart = sourceSlide.GetPartById(persistRelationshipId); }
        catch (ArgumentOutOfRangeException) { throw new UnsupportedComponentException($"Unresolved SmartArt persisted drawing relationship {persistRelationshipId}."); }
        if (persistPart is not DiagramPersistLayoutPart)
            throw new UnsupportedComponentException("The SmartArt persisted drawing relationship resolves to an unexpected part type.");
        result.Add(new SmartArtPartReference("dr", persistRelationshipId, persistPart));
        return result;
    }

    private static HashSet<string> ValidateXmlPart(OpenXmlPart part, string expectedRootName, string expectedNamespace, long maximumBytes, string description, bool allowsImages)
    {
        if (part.ExternalRelationships.Any() || part.HyperlinkRelationships.Any() || part.DataPartReferenceRelationships.Any())
            throw new UnsupportedComponentException($"SmartArt {description} cannot contain external, hyperlink, or media-reference relationships.");
        using var stream = part.GetStream(FileMode.Open, FileAccess.Read);
        if (stream.Length <= 0 || stream.Length > maximumBytes)
            throw new UnsupportedComponentException($"SmartArt {description} XML is empty or exceeds the {maximumBytes / (1024 * 1024)} MiB safety limit.");
        try
        {
            var referencedIds = new HashSet<string>(StringComparer.Ordinal);
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersInDocument = maximumBytes
            });
            reader.MoveToContent();
            if (reader.LocalName != expectedRootName || reader.NamespaceURI != expectedNamespace)
                throw new UnsupportedComponentException($"SmartArt {description} has an unexpected XML root.");
            do
            {
                if (!reader.HasAttributes) continue;
                while (reader.MoveToNextAttribute())
                    if (reader.NamespaceURI == RelationshipNamespace && !string.IsNullOrWhiteSpace(reader.Value))
                    {
                        if (!allowsImages || reader.LocalName != "embed")
                            throw new UnsupportedComponentException($"SmartArt {description} contains an unsupported relationship reference.");
                        referencedIds.Add(reader.Value);
                    }
                reader.MoveToElement();
            }
            while (reader.Read());
            return referencedIds;
        }
        catch (XmlException)
        {
            throw new UnsupportedComponentException($"SmartArt {description} contains malformed or unsafe XML.");
        }
    }

    private static string ReadPersistRelationshipId(DiagramDataPart dataPart)
    {
        using var stream = dataPart.GetStream(FileMode.Open, FileAccess.Read);
        if (stream.Length <= 0 || stream.Length > MaximumDataBytes)
            throw new UnsupportedComponentException("SmartArt data XML is empty or exceeds the 16 MiB safety limit.");
        try
        {
            using var reader = XmlReader.Create(stream, SafeXmlSettings(MaximumDataBytes));
            var ids = new List<string>();
            while (reader.Read())
                if (reader.NodeType == XmlNodeType.Element && reader.LocalName == "dataModelExt" && reader.NamespaceURI == DiagramDrawingNamespace)
                {
                    var value = reader.GetAttribute("relId");
                    if (!string.IsNullOrWhiteSpace(value)) ids.Add(value);
                }
            if (ids.Count != 1)
                throw new UnsupportedComponentException("SmartArt data must reference exactly one persisted drawing cache.");
            return ids[0];
        }
        catch (XmlException)
        {
            throw new UnsupportedComponentException("SmartArt data contains malformed or unsafe XML.");
        }
    }

    private static void CopyDataWithRemappedPersistRelationship(OpenXmlPart source, OpenXmlPart target, string targetRelationshipId)
    {
        var document = new XmlDocument { PreserveWhitespace = true, XmlResolver = null };
        using (var input = source.GetStream(FileMode.Open, FileAccess.Read))
        using (var reader = XmlReader.Create(input, SafeXmlSettings(MaximumDataBytes))) document.Load(reader);
        var nodes = document.GetElementsByTagName("dataModelExt", DiagramDrawingNamespace).OfType<XmlElement>().ToList();
        if (nodes.Count != 1 || string.IsNullOrWhiteSpace(nodes[0].GetAttribute("relId")))
            throw new UnsupportedComponentException("SmartArt data changed after persisted drawing validation.");
        nodes[0].SetAttribute("relId", targetRelationshipId);
        using var output = target.GetStream(FileMode.Create, FileAccess.Write);
        using var writer = XmlWriter.Create(output, new XmlWriterSettings
        {
            Encoding = new System.Text.UTF8Encoding(false),
            Indent = false,
            OmitXmlDeclaration = false,
            NewLineChars = "\n",
            NewLineHandling = NewLineHandling.Replace
        });
        document.Save(writer);
    }

    private static XmlReaderSettings SafeXmlSettings(long maximumBytes) => new()
    {
        DtdProcessing = DtdProcessing.Prohibit,
        XmlResolver = null,
        MaxCharactersInDocument = maximumBytes
    };

    private sealed record SmartArtPartReference(string RelationshipName, string RelationshipId, OpenXmlPart Part);
}
