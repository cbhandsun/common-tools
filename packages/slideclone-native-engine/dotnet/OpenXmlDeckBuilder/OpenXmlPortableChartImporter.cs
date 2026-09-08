using System.IO.Compression;
using System.Xml;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using P = DocumentFormat.OpenXml.Presentation;

internal static class OpenXmlPortableChartImporter
{
    private const long MaximumChartBytes = 16L * 1024 * 1024;
    private const long MaximumChartStyleBytes = 4L * 1024 * 1024;
    private const long MaximumThemeOverrideBytes = 4L * 1024 * 1024;
    private const long MaximumWorkbookBytes = 64L * 1024 * 1024;
    private const long MaximumWorkbookExpandedBytes = 128L * 1024 * 1024;
    private const int MaximumWorkbookEntries = 256;
    private const string RelationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private const string ChartGraphicDataUri = "http://schemas.openxmlformats.org/drawingml/2006/chart";
    private const string ChartNamespace = "http://schemas.openxmlformats.org/drawingml/2006/chart";
    private const string SpreadsheetContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private const string ChartStyleNamespace = "http://schemas.microsoft.com/office/drawing/2012/chartStyle";
    private const string DrawingNamespace = "http://schemas.openxmlformats.org/drawingml/2006/main";

    public static bool IsPortableFrame(SlidePart sourceSlide, P.GraphicFrame frame)
    {
        var graphicData = frame.Graphic?.GraphicData;
        if (graphicData is null || !string.Equals(graphicData.Uri?.Value, ChartGraphicDataUri, StringComparison.Ordinal)
            || graphicData.ChildElements.Count != 1 || !IsChartReference(graphicData.ChildElements[0])) return false;
        var relationshipId = graphicData.ChildElements[0].GetAttribute("id", RelationshipNamespace).Value;
        if (string.IsNullOrWhiteSpace(relationshipId)) return false;
        try
        {
            return sourceSlide.GetPartById(relationshipId) is ChartPart;
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }
    }

    public static bool IsChartReference(OpenXmlElement element) =>
        element.LocalName == "chart" && element.NamespaceUri == ChartNamespace;

    public static void Validate(ChartPart chartPart)
    {
        if (chartPart.ExternalRelationships.Any() || chartPart.HyperlinkRelationships.Any() || chartPart.DataPartReferenceRelationships.Any())
            throw new UnsupportedComponentException("Native chart external, hyperlink, and media relationships are not portable.");
        using (var chartStream = chartPart.GetStream(FileMode.Open, FileAccess.Read))
            if (chartStream.Length <= 0 || chartStream.Length > MaximumChartBytes)
                throw new UnsupportedComponentException("Native chart XML is empty or exceeds the 16 MiB safety limit.");

        var children = chartPart.Parts.ToList();
        var workbookParts = children.Where(pair => pair.OpenXmlPart is EmbeddedPackagePart).ToList();
        var chartStyleParts = children.Where(pair => pair.OpenXmlPart is ChartStylePart).ToList();
        var chartColorStyleParts = children.Where(pair => pair.OpenXmlPart is ChartColorStylePart).ToList();
        var themeOverrideParts = children.Where(pair => pair.OpenXmlPart is ThemeOverridePart).ToList();
        var chartDrawingParts = children.Where(pair => pair.OpenXmlPart is ChartDrawingPart).ToList();
        if (workbookParts.Count != 1 || chartStyleParts.Count > 1 || chartColorStyleParts.Count > 1 || themeOverrideParts.Count > 1 || chartDrawingParts.Count > 1
            || children.Count != workbookParts.Count + chartStyleParts.Count + chartColorStyleParts.Count + themeOverrideParts.Count + chartDrawingParts.Count)
            throw new UnsupportedComponentException("A portable native chart must contain one embedded workbook, at most one style, color style, theme override, and user-shapes drawing, and no unknown child parts.");
        var workbookPart = (EmbeddedPackagePart)workbookParts[0].OpenXmlPart;
        if (!string.Equals(workbookPart.ContentType, SpreadsheetContentType, StringComparison.OrdinalIgnoreCase))
            throw new UnsupportedComponentException("A portable native chart workbook must use the non-macro XLSX content type.");
        foreach (var pair in chartStyleParts)
            ValidateStylePart(pair.OpenXmlPart, "chartStyle");
        foreach (var pair in chartColorStyleParts)
            ValidateSelfContainedXmlPart(pair.OpenXmlPart, "colorStyle", ChartStyleNamespace, MaximumChartStyleBytes, "chart style");
        foreach (var pair in themeOverrideParts)
            ValidateSelfContainedXmlPart(pair.OpenXmlPart, "themeOverride", DrawingNamespace, MaximumThemeOverrideBytes, "chart theme override");
        foreach (var pair in chartDrawingParts)
            OpenXmlPortableChartDrawingImporter.Validate((ChartDrawingPart)pair.OpenXmlPart);
        using var workbookStream = workbookPart.GetStream(FileMode.Open, FileAccess.Read);
        if (workbookStream.Length <= 0 || workbookStream.Length > MaximumWorkbookBytes)
            throw new UnsupportedComponentException("The embedded chart workbook is empty or exceeds the 64 MiB safety limit.");
        using var buffer = new MemoryStream(checked((int)workbookStream.Length));
        workbookStream.CopyTo(buffer);
        ValidateWorkbook(buffer);
    }

    public static ChartPart Copy(ChartPart sourceChart, SlidePart targetSlide)
    {
        Validate(sourceChart);
        var targetChart = targetSlide.AddNewPart<ChartPart>(OpenXmlRelationshipIdAllocator.Next(targetSlide, "rIdImportedChart", "an imported native chart"));
        using (var input = sourceChart.GetStream(FileMode.Open, FileAccess.Read)) targetChart.FeedData(input);
        foreach (var pair in sourceChart.Parts)
        {
            if (pair.OpenXmlPart is ChartDrawingPart chartDrawing)
            {
                OpenXmlPortableChartDrawingImporter.Copy(chartDrawing, targetChart, pair.RelationshipId);
                continue;
            }
            OpenXmlPart targetPart = pair.OpenXmlPart switch
            {
                EmbeddedPackagePart workbook => targetChart.AddEmbeddedPackagePart(workbook.ContentType, pair.RelationshipId),
                ChartStylePart => targetChart.AddNewPart<ChartStylePart>(pair.RelationshipId),
                ChartColorStylePart => targetChart.AddNewPart<ChartColorStylePart>(pair.RelationshipId),
                ThemeOverridePart => targetChart.AddNewPart<ThemeOverridePart>(pair.RelationshipId),
                _ => throw new UnsupportedComponentException("A native chart child part changed after validation.")
            };
            using var input = pair.OpenXmlPart.GetStream(FileMode.Open, FileAccess.Read);
            targetPart.FeedData(input);
        }
        return targetChart;
    }

    private static void ValidateStylePart(OpenXmlPart part, string expectedRootName) =>
        ValidateSelfContainedXmlPart(part, expectedRootName, ChartStyleNamespace, MaximumChartStyleBytes, "chart style");

    private static void ValidateSelfContainedXmlPart(
        OpenXmlPart part,
        string expectedRootName,
        string expectedNamespace,
        long maximumBytes,
        string description)
    {
        if (part.Parts.Any() || part.ExternalRelationships.Any() || part.HyperlinkRelationships.Any() || part.DataPartReferenceRelationships.Any())
            throw new UnsupportedComponentException($"Native {description} parts must be self-contained XML without relationships.");
        using var stream = part.GetStream(FileMode.Open, FileAccess.Read);
        if (stream.Length <= 0 || stream.Length > maximumBytes)
            throw new UnsupportedComponentException($"A native {description} part is empty or exceeds the {maximumBytes / (1024 * 1024)} MiB safety limit.");
        try
        {
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersInDocument = maximumBytes
            });
            reader.MoveToContent();
            if (reader.LocalName != expectedRootName || reader.NamespaceURI != expectedNamespace)
                throw new UnsupportedComponentException($"A native {description} part has an unexpected XML root.");
            while (reader.Read()) { }
        }
        catch (XmlException)
        {
            throw new UnsupportedComponentException($"A native {description} part contains malformed or unsafe XML.");
        }
    }

    private static void ValidateWorkbook(MemoryStream buffer)
    {
        buffer.Position = 0;
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Read, leaveOpen: true))
        {
            if (archive.Entries.Count == 0 || archive.Entries.Count > MaximumWorkbookEntries)
                throw new UnsupportedComponentException($"An embedded chart workbook must contain between 1 and {MaximumWorkbookEntries} ZIP entries.");
            long expandedBytes = 0;
            foreach (var entry in archive.Entries)
            {
                var normalized = entry.FullName.Replace('\\', '/');
                if (string.IsNullOrWhiteSpace(normalized) || normalized.StartsWith('/') || normalized.Contains('\0')
                    || normalized.Split('/').Any(segment => segment == ".."))
                    throw new UnsupportedComponentException("The embedded chart workbook contains an unsafe ZIP entry path.");
                expandedBytes = checked(expandedBytes + entry.Length);
                if (entry.Length > MaximumWorkbookBytes || expandedBytes > MaximumWorkbookExpandedBytes)
                    throw new UnsupportedComponentException("The embedded chart workbook exceeds the expanded-size safety limit.");
                var lower = normalized.ToLowerInvariant();
                if (lower.Contains("/externallinks/") || lower.EndsWith("/vbaproject.bin") || lower.Contains("/activex/")
                    || lower.Contains("/oleobjects/") || lower.Contains("/embeddings/") || lower.EndsWith("/connections.xml"))
                    throw new UnsupportedComponentException("The embedded chart workbook contains external, macro, ActiveX, OLE, or connection content.");
                if (lower.EndsWith(".rels")) ValidateRelationships(entry);
            }
        }

        buffer.Position = 0;
        using var workbook = SpreadsheetDocument.Open(buffer, false);
        if (workbook.DocumentType != SpreadsheetDocumentType.Workbook || workbook.WorkbookPart is null
            || !workbook.WorkbookPart.WorksheetParts.Any())
            throw new UnsupportedComponentException("The embedded chart workbook is not a valid non-macro workbook with worksheet data.");
        var parts = DescendantParts(workbook).ToList();
        if (parts.Count > MaximumWorkbookEntries || parts.Any(part => !IsAllowedWorkbookPart(part.ContentType)))
            throw new UnsupportedComponentException("The embedded chart workbook contains an unknown or unsupported part type.");
        if (workbook.ExternalRelationships.Any() || workbook.HyperlinkRelationships.Any() || workbook.DataPartReferenceRelationships.Any()
            || parts.Any(part => part.ExternalRelationships.Any() || part.HyperlinkRelationships.Any() || part.DataPartReferenceRelationships.Any()))
            throw new UnsupportedComponentException("The embedded chart workbook contains external or media relationships.");
    }

    private static void ValidateRelationships(ZipArchiveEntry entry)
    {
        if (entry.Length > 1024 * 1024) throw new UnsupportedComponentException("An embedded workbook relationship file exceeds 1 MiB.");
        using var stream = entry.Open();
        using var reader = XmlReader.Create(stream, new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = 1024 * 1024
        });
        while (reader.Read())
            if (reader.NodeType == XmlNodeType.Element
                && string.Equals(reader.GetAttribute("TargetMode"), "External", StringComparison.OrdinalIgnoreCase))
                throw new UnsupportedComponentException("The embedded chart workbook contains an external relationship target.");
    }

    private static IEnumerable<OpenXmlPart> DescendantParts(OpenXmlPartContainer root)
    {
        var pending = new Stack<OpenXmlPart>(root.Parts.Select(pair => pair.OpenXmlPart));
        var visited = new HashSet<Uri>();
        while (pending.Count > 0)
        {
            var part = pending.Pop();
            if (!visited.Add(part.Uri)) continue;
            yield return part;
            foreach (var child in part.Parts) pending.Push(child.OpenXmlPart);
        }
    }

    private static bool IsAllowedWorkbookPart(string contentType) => contentType is
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" or
        "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" or
        "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml" or
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml" or
        "application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml" or
        "application/vnd.openxmlformats-officedocument.theme+xml" or
        "application/vnd.openxmlformats-package.core-properties+xml" or
        "application/vnd.openxmlformats-officedocument.extended-properties+xml" or
        "application/vnd.openxmlformats-officedocument.custom-properties+xml";
}
