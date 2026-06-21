using System.IO.Compression;
using System.Text;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

var options = ParseArgs(args);
if (!options.TryGetValue("ir", out var irFileValue))
{
    Console.Error.WriteLine("Usage: OpenXmlDeckBuilder --ir <deck.json> --out <deck.pptx>");
    Environment.Exit(1);
}
if (!options.TryGetValue("out", out var outFileValue))
{
    Console.Error.WriteLine("Usage: OpenXmlDeckBuilder --ir <deck.json> --out <deck.pptx>");
    Environment.Exit(1);
}
var irFile = irFileValue;
var outFile = outFileValue;

var ir = JsonSerializer.Deserialize<DeckIr>(File.ReadAllText(irFile), new JsonSerializerOptions
{
    PropertyNameCaseInsensitive = true
}) ?? throw new InvalidOperationException("Invalid IR JSON.");
var irDirectory = Path.GetDirectoryName(Path.GetFullPath(irFile)) ?? Directory.GetCurrentDirectory();

Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outFile))!);
if (File.Exists(outFile)) File.Delete(outFile);

{
    using var document = PresentationDocument.Create(outFile, PresentationDocumentType.Presentation);
    var presentationPart = document.AddPresentationPart();
    presentationPart.Presentation = new P.Presentation();
    var slideIdList = new P.SlideIdList();
    presentationPart.Presentation.Append(slideIdList);

    var masterPart = presentationPart.AddNewPart<SlideMasterPart>("rIdMaster");
    masterPart.SlideMaster = CreateSlideMaster();
    AddTheme(masterPart);
    var layoutPart = masterPart.AddNewPart<SlideLayoutPart>("rIdLayout");
    layoutPart.SlideLayout = CreateSlideLayout();
    masterPart.SlideMaster.Append(new P.SlideLayoutIdList(
        new P.SlideLayoutId { Id = 2147483649U, RelationshipId = masterPart.GetIdOfPart(layoutPart) }
    ));

    presentationPart.Presentation.SlideMasterIdList = new P.SlideMasterIdList(
        new P.SlideMasterId { Id = 2147483648U, RelationshipId = presentationPart.GetIdOfPart(masterPart) }
    );
    presentationPart.Presentation.SlideSize = new P.SlideSize
    {
        Cx = ToInt32Emu(ir.SlideSize.WidthPt),
        Cy = ToInt32Emu(ir.SlideSize.HeightPt),
        Type = P.SlideSizeValues.Custom
    };
    presentationPart.Presentation.NotesSize = new P.NotesSize { Cx = 6858000, Cy = 9144000 };

    uint slideId = 256U;
    foreach (var page in ir.Pages.OrderBy(page => page.PageIndex))
    {
        page.SlideSize = ir.SlideSize;
        var slidePart = presentationPart.AddNewPart<SlidePart>();
        slidePart.AddPart(layoutPart);
        slidePart.Slide = CreateSlide(page, slidePart, irDirectory);
        slideIdList.Append(new P.SlideId
        {
            Id = slideId++,
            RelationshipId = presentationPart.GetIdOfPart(slidePart)
        });
    }

    presentationPart.Presentation.Save();
    Validate(document);
}

FixContentTypes(outFile);
using (var validationDocument = PresentationDocument.Open(outFile, false))
{
    Validate(validationDocument);
}

Console.WriteLine(outFile);

static Dictionary<string, string> ParseArgs(string[] args)
{
    var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    for (var i = 0; i < args.Length; i++)
    {
        if (!args[i].StartsWith("--") || i + 1 >= args.Length) continue;
        result[args[i][2..]] = args[i + 1];
        i++;
    }
    return result;
}

static P.Slide CreateSlide(PageIr page, SlidePart slidePart, string irDirectory)
{
    var shapeTree = new P.ShapeTree();
    shapeTree.Append(new P.NonVisualGroupShapeProperties(
        new P.NonVisualDrawingProperties { Id = 1U, Name = "" },
        new P.NonVisualGroupShapeDrawingProperties(),
        new P.ApplicationNonVisualDrawingProperties()
    ));
    shapeTree.Append(new P.GroupShapeProperties(new A.TransformGroup()));

    uint shapeId = 2U;
    if (!string.IsNullOrWhiteSpace(GetString(page.Background, "fill")))
    {
        shapeTree.Append(CreateBackground(page, shapeId++));
    }

    foreach (var shape in page.Shapes ?? [])
    {
        shapeTree.Append(CreateShape(shape, shapeId++));
    }

    foreach (var image in page.Images ?? [])
    {
        if (TryCreatePicture(image, slidePart, shapeId, irDirectory, out var picture))
        {
            shapeTree.Append(picture);
            shapeId++;
        }
    }

    foreach (var table in page.Tables ?? [])
    {
        if (table.Rows is { Count: > 0 })
        {
            shapeTree.Append(CreateTable(table, shapeId++));
        }
    }

    foreach (var textBox in page.TextBoxes)
    {
        shapeTree.Append(CreateTextBox(textBox, shapeId++));
    }

    return new P.Slide(new P.CommonSlideData(shapeTree), new P.ColorMapOverride(new A.MasterColorMapping()));
}

static P.Shape CreateBackground(PageIr page, uint shapeId)
{
    var fill = NormalizeHex(GetString(page.Background, "fill") ?? "#FFFFFF");
    return new P.Shape(
        new P.NonVisualShapeProperties(
            new P.NonVisualDrawingProperties { Id = shapeId, Name = "background" },
            new P.NonVisualShapeDrawingProperties(new A.ShapeLocks { NoGrouping = true }),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        new P.ShapeProperties(
            new A.Transform2D(
                new A.Offset { X = 0, Y = 0 },
                new A.Extents { Cx = ToEmu(page.SlideSize.WidthPt), Cy = ToEmu(page.SlideSize.HeightPt) }
            ),
            new A.PresetGeometry { Preset = A.ShapeTypeValues.Rectangle },
            new A.SolidFill(new A.RgbColorModelHex { Val = fill }),
            new A.Outline(new A.NoFill())
        )
    );
}

static P.Shape CreateTextBox(TextBoxIr textBox, uint shapeId)
{
    var fontSize = (int)Math.Round((textBox.Font?.SizePt ?? 14) * 100);
    var color = NormalizeHex(textBox.Font?.Color ?? "#111111");
    var runProperties = new A.RunProperties
    {
        FontSize = fontSize,
        Bold = string.Equals(textBox.Font?.Weight, "bold", StringComparison.OrdinalIgnoreCase)
    };
    runProperties.Append(new A.SolidFill(new A.RgbColorModelHex { Val = color }));

    return new P.Shape(
        new P.NonVisualShapeProperties(
            new P.NonVisualDrawingProperties { Id = shapeId, Name = textBox.Id },
            new P.NonVisualShapeDrawingProperties(new A.ShapeLocks { NoGrouping = true }),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        new P.ShapeProperties(
            new A.Transform2D(
                new A.Offset { X = ToEmu(textBox.Box.X), Y = ToEmu(textBox.Box.Y) },
                new A.Extents { Cx = ToEmu(textBox.Box.W), Cy = ToEmu(textBox.Box.H) }
            ),
            new A.PresetGeometry { Preset = A.ShapeTypeValues.Rectangle },
            new A.NoFill(),
            new A.Outline(new A.NoFill())
        ),
        new P.TextBody(
            new A.BodyProperties { Wrap = A.TextWrappingValues.Square },
            new A.ListStyle(),
            new A.Paragraph(
                new A.Run(
                    runProperties,
                    new A.Text(textBox.Text ?? string.Empty)
                )
            )
        )
    );
}

static P.Shape CreateShape(VisualElementIr element, uint shapeId)
{
    var preset = ToShapeType(element.Type);
    var shapeProperties = new P.ShapeProperties(
        new A.Transform2D(
            new A.Offset { X = ToEmu(element.Box.X), Y = ToEmu(element.Box.Y) },
            new A.Extents { Cx = ToEmu(element.Box.W), Cy = ToEmu(element.Box.H) }
        ),
        new A.PresetGeometry { Preset = preset }
    );

    var fill = GetString(element.Style, "fill");
    shapeProperties.Append(string.IsNullOrWhiteSpace(fill)
        ? new A.NoFill()
        : new A.SolidFill(new A.RgbColorModelHex { Val = NormalizeHex(fill) }));

    var stroke = GetString(element.Style, "stroke");
    var strokeWidth = GetNumber(element.Style, "strokeWidthPt") ?? GetNumber(element.Style, "strokeWidth") ?? 1;
    shapeProperties.Append(string.IsNullOrWhiteSpace(stroke)
        ? new A.Outline(new A.NoFill())
        : new A.Outline(
            new A.SolidFill(new A.RgbColorModelHex { Val = NormalizeHex(stroke) })
        )
        {
            Width = ToLineWidth(strokeWidth)
        });

    return new P.Shape(
        new P.NonVisualShapeProperties(
            new P.NonVisualDrawingProperties { Id = shapeId, Name = element.Id },
            new P.NonVisualShapeDrawingProperties(new A.ShapeLocks { NoGrouping = true }),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        shapeProperties
    );
}

static bool TryCreatePicture(VisualElementIr element, SlidePart slidePart, uint shapeId, string irDirectory, out P.Picture picture)
{
    picture = new P.Picture();
    var assetPath = element.AssetPath ?? GetString(element.Style, "assetPath") ?? GetString(element.Source, "pageImage");
    assetPath = ResolvePath(assetPath, irDirectory);
    if (string.IsNullOrWhiteSpace(assetPath) || !File.Exists(assetPath)) return false;

    var imagePart = slidePart.AddImagePart(GetImagePartType(assetPath));
    using (var stream = File.OpenRead(assetPath))
    {
        imagePart.FeedData(stream);
    }
    var relId = slidePart.GetIdOfPart(imagePart);

    picture = new P.Picture(
        new P.NonVisualPictureProperties(
            new P.NonVisualDrawingProperties { Id = shapeId, Name = element.Id },
            new P.NonVisualPictureDrawingProperties(new A.PictureLocks { NoChangeAspect = true }),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        new P.BlipFill(
            new A.Blip { Embed = relId },
            new A.Stretch(new A.FillRectangle())
        ),
        new P.ShapeProperties(
            new A.Transform2D(
                new A.Offset { X = ToEmu(element.Box.X), Y = ToEmu(element.Box.Y) },
                new A.Extents { Cx = ToEmu(element.Box.W), Cy = ToEmu(element.Box.H) }
            ),
            new A.PresetGeometry { Preset = A.ShapeTypeValues.Rectangle }
        )
    );
    return true;
}

static string? ResolvePath(string? file, string irDirectory)
{
    if (string.IsNullOrWhiteSpace(file)) return null;
    return Path.IsPathRooted(file) ? file : Path.GetFullPath(Path.Combine(irDirectory, file));
}

static P.GraphicFrame CreateTable(VisualElementIr table, uint shapeId)
{
    var rows = table.Rows ?? [];
    var colCount = Math.Max(1, rows.Max(row => row.Count));
    var rowHeight = ToEmu(table.Box.H / Math.Max(1, rows.Count));
    var colWidth = ToEmu(table.Box.W / colCount);

    var tableGrid = new A.TableGrid();
    for (var i = 0; i < colCount; i++)
    {
        tableGrid.Append(new A.GridColumn { Width = colWidth });
    }
    var drawingTable = new A.Table(
        new A.TableProperties { FirstRow = true, BandRow = true },
        tableGrid
    );

    foreach (var row in rows)
    {
        var tableRow = new A.TableRow { Height = rowHeight };
        for (var i = 0; i < colCount; i++)
        {
            var text = i < row.Count ? row[i] : string.Empty;
            tableRow.Append(new A.TableCell(
                new A.TextBody(
                    new A.BodyProperties(),
                    new A.ListStyle(),
                    new A.Paragraph(new A.Run(
                        new A.RunProperties { FontSize = 1100 },
                        new A.Text(text)
                    ))
                ),
                new A.TableCellProperties(
                    new A.SolidFill(new A.RgbColorModelHex { Val = "FFFFFF" })
                )
            ));
        }
        drawingTable.Append(tableRow);
    }

    return new P.GraphicFrame(
        new P.NonVisualGraphicFrameProperties(
            new P.NonVisualDrawingProperties { Id = shapeId, Name = table.Id },
            new P.NonVisualGraphicFrameDrawingProperties(),
            new P.ApplicationNonVisualDrawingProperties()
        ),
        new P.Transform(
            new A.Offset { X = ToEmu(table.Box.X), Y = ToEmu(table.Box.Y) },
            new A.Extents { Cx = ToEmu(table.Box.W), Cy = ToEmu(table.Box.H) }
        ),
        new A.Graphic(new A.GraphicData(drawingTable)
        {
            Uri = "http://schemas.openxmlformats.org/drawingml/2006/table"
        })
    );
}

static P.SlideMaster CreateSlideMaster()
{
    return new P.SlideMaster(
        new P.CommonSlideData(new P.ShapeTree(
            new P.NonVisualGroupShapeProperties(
                new P.NonVisualDrawingProperties { Id = 1U, Name = "" },
                new P.NonVisualGroupShapeDrawingProperties(),
                new P.ApplicationNonVisualDrawingProperties()
            ),
            new P.GroupShapeProperties(new A.TransformGroup())
        )),
        new P.ColorMap
        {
            Background1 = A.ColorSchemeIndexValues.Light1,
            Text1 = A.ColorSchemeIndexValues.Dark1,
            Background2 = A.ColorSchemeIndexValues.Light2,
            Text2 = A.ColorSchemeIndexValues.Dark2,
            Accent1 = A.ColorSchemeIndexValues.Accent1,
            Accent2 = A.ColorSchemeIndexValues.Accent2,
            Accent3 = A.ColorSchemeIndexValues.Accent3,
            Accent4 = A.ColorSchemeIndexValues.Accent4,
            Accent5 = A.ColorSchemeIndexValues.Accent5,
            Accent6 = A.ColorSchemeIndexValues.Accent6,
            Hyperlink = A.ColorSchemeIndexValues.Hyperlink,
            FollowedHyperlink = A.ColorSchemeIndexValues.FollowedHyperlink
        }
    );
}

static P.SlideLayout CreateSlideLayout()
{
    return new P.SlideLayout(
        new P.CommonSlideData(new P.ShapeTree(
            new P.NonVisualGroupShapeProperties(
                new P.NonVisualDrawingProperties { Id = 1U, Name = "" },
                new P.NonVisualGroupShapeDrawingProperties(),
                new P.ApplicationNonVisualDrawingProperties()
            ),
            new P.GroupShapeProperties(new A.TransformGroup())
        )),
        new P.ColorMapOverride(new A.MasterColorMapping())
    );
}

static void Validate(PresentationDocument document)
{
    var validationErrors = new OpenXmlValidator(FileFormatVersions.Office2019).Validate(document).ToList();
    if (validationErrors.Count == 0) return;
    foreach (var error in validationErrors.Take(50))
    {
        Console.Error.WriteLine($"{error.Path?.XPath}: {error.Description}");
    }
    throw new InvalidOperationException($"Generated PPTX is not valid Open XML. Error count: {validationErrors.Count}");
}

static void AddTheme(SlideMasterPart masterPart)
{
    var themePart = masterPart.AddNewPart<ThemePart>("rIdTheme");
    const string themeXml =
        """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
          <a:themeElements>
            <a:clrScheme name="Office">
              <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
              <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
              <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
              <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
              <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
              <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
              <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
              <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
              <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
              <a:accent6><a:srgbClr val="F79646"/></a:accent6>
              <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
              <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
            </a:clrScheme>
            <a:fontScheme name="Office">
              <a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
              <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
            </a:fontScheme>
            <a:fmtScheme name="Office">
              <a:fillStyleLst>
                <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
                <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
                <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
              </a:fillStyleLst>
              <a:lnStyleLst>
                <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
                <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
                <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
              </a:lnStyleLst>
              <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
              <a:bgFillStyleLst>
                <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
                <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
                <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
              </a:bgFillStyleLst>
            </a:fmtScheme>
          </a:themeElements>
          <a:objectDefaults/>
          <a:extraClrSchemeLst/>
        </a:theme>
        """;
    using var stream = new MemoryStream(Encoding.UTF8.GetBytes(themeXml));
    themePart.FeedData(stream);
}

static void FixContentTypes(string pptxFile)
{
    using var archive = ZipFile.Open(pptxFile, ZipArchiveMode.Update);
    var entry = archive.GetEntry("[Content_Types].xml")
        ?? throw new InvalidOperationException("PPTX is missing [Content_Types].xml");
    string xml;
    using (var reader = new StreamReader(entry.Open(), Encoding.UTF8))
    {
        xml = reader.ReadToEnd();
    }
    xml = xml.Replace(
        "<Default Extension=\"xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\" />",
        "<Default Extension=\"xml\" ContentType=\"application/xml\" />"
    );
    if (!xml.Contains("PartName=\"/ppt/presentation.xml\"", StringComparison.OrdinalIgnoreCase))
    {
        xml = xml.Replace(
            "</Types>",
            "<Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\" /></Types>"
        );
    }
    entry.Delete();
    var newEntry = archive.CreateEntry("[Content_Types].xml");
    using var writer = new StreamWriter(newEntry.Open(), new UTF8Encoding(false));
    writer.Write(xml);
}

static long ToEmu(double point) => (long)Math.Round(point * 12700);

static int ToInt32Emu(double point) => checked((int)Math.Round(point * 12700));

static int ToLineWidth(double point) => Math.Max(0, (int)Math.Round(point * 12700));

static A.ShapeTypeValues ToShapeType(string? type)
{
    return (type ?? "rect").ToLowerInvariant() switch
    {
        "line" => A.ShapeTypeValues.Line,
        "ellipse" or "oval" or "circle" => A.ShapeTypeValues.Ellipse,
        "roundrect" or "rounded-rect" or "roundedRectangle" => A.ShapeTypeValues.RoundRectangle,
        "triangle" => A.ShapeTypeValues.Triangle,
        "diamond" => A.ShapeTypeValues.Diamond,
        _ => A.ShapeTypeValues.Rectangle
    };
}

static PartTypeInfo GetImagePartType(string file)
{
    return Path.GetExtension(file).ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => ImagePartType.Jpeg,
        ".gif" => ImagePartType.Gif,
        ".bmp" => ImagePartType.Bmp,
        ".tif" or ".tiff" => ImagePartType.Tiff,
        _ => ImagePartType.Png
    };
}

static string NormalizeHex(string color)
{
    var value = color.Trim().TrimStart('#');
    return value.Length == 6 ? value.ToUpperInvariant() : "111111";
}

static string? GetString(JsonElement? element, string property)
{
    if (element is null || element.Value.ValueKind != JsonValueKind.Object) return null;
    return element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
        ? value.GetString()
        : null;
}

static double? GetNumber(JsonElement? element, string property)
{
    if (element is null || element.Value.ValueKind != JsonValueKind.Object) return null;
    return element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number
        ? value.GetDouble()
        : null;
}

public sealed record DeckIr(string Version, SlideSizeIr SlideSize, List<PageIr> Pages);
public sealed record SlideSizeIr(double WidthPt, double HeightPt);
public sealed record PageIr(
    int PageIndex,
    string SourceImage,
    List<TextBoxIr> TextBoxes,
    List<VisualElementIr>? Shapes,
    List<VisualElementIr>? Images,
    List<VisualElementIr>? Tables,
    JsonElement? Background
)
{
    public SlideSizeIr SlideSize { get; set; } = new(960, 540);
}
public sealed record TextBoxIr(string Id, string Text, BoxIr Box, FontIr? Font);
public sealed record BoxIr(double X, double Y, double W, double H);
public sealed record FontIr(string? Family, double? SizePt, string? Weight, string? Color, string? Align);
public sealed record VisualElementIr(
    string Id,
    string? Type,
    BoxIr Box,
    JsonElement? Style,
    JsonElement? Source,
    string? AssetPath,
    List<List<string>>? Rows
);
