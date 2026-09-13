using DocumentFormat.OpenXml.Packaging;
using P = DocumentFormat.OpenXml.Presentation;

public sealed record TemplateBuildContext(string[] LayoutIds, int[] SlideIndices)
{
    public static TemplateBuildContext Inspect(string templatePptx)
    {
        var templatePath = DeckPackageWriter.RequiredFile(templatePptx, "PPTX template");
        try
        {
            PptxPackageAdmissionValidator.ValidateTemplate(templatePath);
            using var document = PresentationDocument.Open(templatePath, false);
            var presentationPart = document.PresentationPart ?? throw new InvalidOperationException("PPTX template is invalid.");
            var slides = GetTemplateSlidesByIndex(presentationPart);
            var layouts = GetTemplateLayoutsById(presentationPart);
            return new TemplateBuildContext(
                layouts.Keys.OrderBy(id => id, StringComparer.Ordinal).ToArray(),
                slides.Keys.OrderBy(index => index).ToArray()
            );
        }
        catch { throw new InvalidOperationException("PPTX template is invalid."); }
    }

    public static void ValidatePageRequests(IEnumerable<PageIr> pages, TemplateBuildContext? template)
    {
        foreach (var page in pages)
        {
            if (page.PreserveTemplateSlide == true)
            {
                if (template is null || Array.BinarySearch(template.SlideIndices, page.PageIndex) < 0)
                    throw new InvalidOperationException("Deck IR template slide request is invalid.");
                continue;
            }

            var requestedLayout = page.Intent?.TemplateLayoutId;
            if (string.IsNullOrWhiteSpace(requestedLayout)) continue;
            if (template is null || !template.LayoutIds.Contains(requestedLayout, StringComparer.OrdinalIgnoreCase))
                throw new InvalidOperationException("Deck IR template layout request is invalid.");
        }
    }

    public static Dictionary<int, SlidePart> GetTemplateSlidesByIndex(PresentationPart presentationPart)
    {
        var orderedSlideIds = presentationPart.Presentation.SlideIdList?.Elements<P.SlideId>().ToList() ?? [];
        var result = new Dictionary<int, SlidePart>();
        for (var index = 0; index < orderedSlideIds.Count; index++)
        {
            var relationshipId = orderedSlideIds[index].RelationshipId?.Value;
            if (!string.IsNullOrWhiteSpace(relationshipId) && presentationPart.GetPartById(relationshipId) is SlidePart slidePart) result[index] = slidePart;
        }
        if (result.Count == 0) throw new InvalidOperationException("PPTX template does not contain usable slides.");
        return result;
    }

    public static Dictionary<string, SlideLayoutPart> GetTemplateLayoutsById(PresentationPart presentationPart)
    {
        var layouts = presentationPart.SlideMasterParts
            .SelectMany(master => master.SlideLayoutParts)
            .GroupBy(layout => Path.GetFileNameWithoutExtension(layout.Uri.OriginalString), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        if (layouts.Count == 0) throw new InvalidOperationException("PPTX template does not contain usable slide layouts.");
        return layouts;
    }
}
