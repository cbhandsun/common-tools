using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using P = DocumentFormat.OpenXml.Presentation;

public static class DeckPackageWriter
{
    public delegate P.Slide SlideFactory(PageIr page, SlidePart slidePart, string irDirectory);
    public delegate P.SlideMaster SlideMasterFactory();
    public delegate P.SlideLayout SlideLayoutFactory();

    public static void Build(
        string irFile,
        string outFile,
        string? templatePptx,
        SlideFactory createSlide,
        SlideMasterFactory createSlideMaster,
        SlideLayoutFactory createSlideLayout)
    {
        ArgumentNullException.ThrowIfNull(createSlide);
        ArgumentNullException.ThrowIfNull(createSlideMaster);
        ArgumentNullException.ThrowIfNull(createSlideLayout);
        var irPath = RequiredFile(irFile, "IR");
        var outputPath = RequiredOutput(outFile, irPath, templatePptx);
        var ir = ReadDeckIr(irPath);
        var irDirectory = Path.GetDirectoryName(irPath) ?? Directory.GetCurrentDirectory();
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        var workPath = outputPath + $".tmp-{Guid.NewGuid():N}";
        try
        {
            var hasTemplate = !string.IsNullOrWhiteSpace(templatePptx);
            using (var document = OpenDocument(workPath, templatePptx))
            {
                PresentationPart presentationPart;
                SlideMasterPart masterPart;
                SlideLayoutPart layoutPart;
                Dictionary<int, SlidePart>? preservedTemplateSlides = null;
                if (hasTemplate)
                {
                    presentationPart = document.PresentationPart ?? throw new InvalidOperationException("PPTX template does not contain a presentation part.");
                    masterPart = presentationPart.SlideMasterParts.FirstOrDefault() ?? throw new InvalidOperationException("PPTX template does not contain a slide master.");
                    var templateSlides = GetTemplateSlidesByIndex(presentationPart);
                    layoutPart = templateSlides.Values.FirstOrDefault()?.SlideLayoutPart
                        ?? masterPart.SlideLayoutParts.FirstOrDefault()
                        ?? throw new InvalidOperationException("PPTX template does not contain a slide layout.");
                    var preserveIndexes = ir.Pages.Where(page => page.PreserveTemplateSlide == true).Select(page => page.PageIndex).ToHashSet();
                    preservedTemplateSlides = templateSlides.Where(pair => preserveIndexes.Contains(pair.Key)).ToDictionary(pair => pair.Key, pair => pair.Value);
                    foreach (var pair in templateSlides.Where(pair => !preserveIndexes.Contains(pair.Key))) presentationPart.DeletePart(pair.Value);
                }
                else
                {
                    presentationPart = document.AddPresentationPart();
                    document.ChangeIdOfPart(presentationPart, "rIdPresentation");
                    presentationPart.Presentation = new P.Presentation();
                    masterPart = presentationPart.AddNewPart<SlideMasterPart>("rIdMaster");
                    masterPart.SlideMaster = createSlideMaster();
                    PresentationPackageServices.AddTheme(presentationPart, masterPart);
                    layoutPart = masterPart.AddNewPart<SlideLayoutPart>("rIdLayout");
                    layoutPart.SlideLayout = createSlideLayout();
                    layoutPart.AddPart(masterPart, "rIdMaster");
                    masterPart.SlideMaster.Append(new P.SlideLayoutIdList(
                        new P.SlideLayoutId { Id = 2147483649U, RelationshipId = masterPart.GetIdOfPart(layoutPart) }
                    ));
                    presentationPart.Presentation.SlideMasterIdList = new P.SlideMasterIdList(
                        new P.SlideMasterId { Id = 2147483648U, RelationshipId = presentationPart.GetIdOfPart(masterPart) }
                    );
                }

                var slideIdList = new P.SlideIdList();
                presentationPart.Presentation.SlideIdList = slideIdList;
                presentationPart.Presentation.SlideSize = new P.SlideSize
                {
                    Cx = ToInt32Emu(ir.SlideSize.WidthPt),
                    Cy = ToInt32Emu(ir.SlideSize.HeightPt),
                    Type = P.SlideSizeValues.Custom
                };
                presentationPart.Presentation.NotesSize ??= new P.NotesSize { Cx = 6858000, Cy = 9144000 };

                uint slideId = 256U;
                foreach (var page in ir.Pages.OrderBy(page => page.PageIndex))
                {
                    page.SlideSize = ir.SlideSize;
                    SlidePart slidePart;
                    if (page.PreserveTemplateSlide == true)
                    {
                        if (preservedTemplateSlides is null || !preservedTemplateSlides.TryGetValue(page.PageIndex, out var preservedSlide))
                            throw new InvalidOperationException($"Template does not contain source slide {page.PageIndex + 1} requested for preservation.");
                        slidePart = preservedSlide;
                    }
                    else
                    {
                        slidePart = presentationPart.AddNewPart<SlidePart>($"rIdSlide{slideId}");
                        slidePart.AddPart(layoutPart, "rIdLayout");
                        slidePart.Slide = createSlide(page, slidePart, irDirectory);
                    }
                    slideIdList.Append(new P.SlideId { Id = slideId++, RelationshipId = presentationPart.GetIdOfPart(slidePart) });
                }
                presentationPart.Presentation.Save();
            }
            // Validate the finalized package once, after content-type repair and
            // ZIP admission. The former in-memory pass walked the same document
            // graph a second time without covering the repaired package state.
            PresentationPackageServices.FixContentTypes(workPath);
            PptxPackageAdmissionValidator.Validate(workPath, "generated PPTX");
            using (var validationDocument = PresentationDocument.Open(workPath, false))
            {
                PresentationPackageServices.Validate(validationDocument);
            }
            File.Move(workPath, outputPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(workPath)) File.Delete(workPath);
        }
    }

    private static DeckIr ReadDeckIr(string irPath)
    {
        var info = new FileInfo(irPath);
        if (info.Length > 64L * 1024 * 1024) throw new InvalidOperationException("Deck IR exceeds the 64 MiB limit.");
        var ir = JsonSerializer.Deserialize<DeckIr>(File.ReadAllText(irPath), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("Invalid IR JSON.");
        if (!string.Equals(ir.Version, "1.0", StringComparison.Ordinal)) throw new InvalidOperationException("Deck IR version must be 1.0.");
        if (ir.SlideSize is null || !double.IsFinite(ir.SlideSize.WidthPt) || !double.IsFinite(ir.SlideSize.HeightPt)
            || ir.SlideSize.WidthPt <= 0 || ir.SlideSize.HeightPt <= 0 || ir.SlideSize.WidthPt > 100000 || ir.SlideSize.HeightPt > 100000)
            throw new InvalidOperationException("Deck IR slideSize must contain bounded positive dimensions.");
        if (ir.Pages is null || ir.Pages.Count == 0 || ir.Pages.Count > 10000) throw new InvalidOperationException("Deck IR must contain 1 to 10000 pages.");
        if (ir.Pages.Any(page => page is null) || ir.Pages.Select(page => page.PageIndex).Distinct().Count() != ir.Pages.Count)
            throw new InvalidOperationException("Deck IR pages must be non-null and have unique pageIndex values.");
        if (ir.Pages.Any(page => page.PageIndex < 0 || page.PageIndex >= 10000))
            throw new InvalidOperationException("Deck IR pageIndex values must be between 0 and 9999.");
        return ir;
    }

    private static PresentationDocument OpenDocument(string outputPath, string? templatePptx)
    {
        if (string.IsNullOrWhiteSpace(templatePptx)) return PresentationDocument.Create(outputPath, PresentationDocumentType.Presentation);
        var templatePath = RequiredFile(templatePptx, "PPTX template");
        PptxPackageAdmissionValidator.Validate(templatePath, "PPTX template");
        File.Copy(templatePath, outputPath, overwrite: true);
        return PresentationDocument.Open(outputPath, true);
    }

    private static string RequiredFile(string value, string label)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Contains('\0')) throw new ArgumentException($"{label} path is invalid.");
        var path = Path.GetFullPath(value);
        if (!File.Exists(path)) throw new FileNotFoundException($"{label} was not found: {path}", path);
        return path;
    }

    private static string RequiredOutput(string value, string irPath, string? templatePptx)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Contains('\0')) throw new ArgumentException("Output path is invalid.", nameof(value));
        var path = Path.GetFullPath(value);
        if (!string.Equals(Path.GetExtension(path), ".pptx", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Output path must use the .pptx extension.");
        if (string.Equals(path, irPath, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Output path cannot overwrite the Deck IR.");
        if (!string.IsNullOrWhiteSpace(templatePptx) && string.Equals(path, Path.GetFullPath(templatePptx), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Output path cannot overwrite the template PPTX.");
        return path;
    }

    private static Dictionary<int, SlidePart> GetTemplateSlidesByIndex(PresentationPart presentationPart)
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

    private static int ToInt32Emu(double point) => checked((int)Math.Round(point * 12700));
}
