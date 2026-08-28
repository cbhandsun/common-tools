"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { promoteNativeChartPayload } = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-payload");
const { listZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");
const {
  readZipEntries,
  readZipEntry: readZipBufferEntry,
  rewriteZipEntries,
  writeStoredZipAtomic
} = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");

const programFile = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "Program.cs");
const modelsFile = path.join(path.dirname(programFile), "Models.cs");
const commandLineFile = path.join(path.dirname(programFile), "CommandLineOptions.cs");
const batchBuilderFile = path.join(path.dirname(programFile), "DeckBatchBuilder.cs");
const packageServicesFile = path.join(path.dirname(programFile), "PresentationPackageServices.cs");
const deckPackageWriterFile = path.join(path.dirname(programFile), "DeckPackageWriter.cs");
const componentImporterFile = path.join(path.dirname(programFile), "OpenXmlComponentReplacementImporter.cs");
const packageAdmissionFile = path.join(path.dirname(programFile), "PptxPackageAdmissionValidator.cs");
const portableChartImporterFile = path.join(path.dirname(programFile), "OpenXmlPortableChartImporter.cs");
const portableChartDrawingImporterFile = path.join(path.dirname(programFile), "OpenXmlPortableChartDrawingImporter.cs");
const portableSmartArtImporterFile = path.join(path.dirname(programFile), "OpenXmlPortableSmartArtImporter.cs");
const portableImageValidatorFile = path.join(path.dirname(programFile), "PortableImageValidator.cs");
const nativeTableWriterFile = path.join(path.dirname(programFile), "NativeTableWriter.cs");
const editableChartFallbackWriterFile = path.join(path.dirname(programFile), "EditableChartFallbackWriter.cs");
const nativeChartWriterFile = path.join(path.dirname(programFile), "NativeChartWriter.cs");
const projectFile = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "OpenXmlDeckBuilder.csproj");
const builderDll = path.join(path.dirname(projectFile), "bin", "Debug", "net8.0", "OpenXmlDeckBuilder.dll");
const pythonBuilderFile = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "python", "build_pptx.py");

test("OpenXmlDeckBuilder keeps transport models outside the composition entry point", () => {
  const program = fs.readFileSync(programFile, "utf8");
  const models = fs.readFileSync(modelsFile, "utf8");
  assert.doesNotMatch(program, /public sealed record (DeckIr|PageIr|VisualElementIr)/);
  assert.match(models, /public sealed record DeckIr/);
  assert.match(models, /public sealed record PageIr/);
  assert.match(models, /public sealed record ComponentReplacementOperationReport/);
});

test("OpenXmlDeckBuilder keeps native chart and table business logic outside the composition entry point", () => {
  const program = fs.readFileSync(programFile, "utf8");
  const chartWriter = fs.readFileSync(nativeChartWriterFile, "utf8");
  const tableWriter = fs.readFileSync(nativeTableWriterFile, "utf8");
  assert.match(program, /NativeChartWriter\.TryCreate/);
  assert.match(program, /NativeTableWriter\.Create/);
  assert.doesNotMatch(program, /WriteChartWorkbook|WriteChartXml|new A\.TableCell/);
  assert.match(chartWriter, /WriteWorkbook/);
  assert.match(chartWriter, /WriteChartXml/);
  assert.match(tableWriter, /new A\.TableCell/);
});

test("OpenXmlDeckBuilder isolates native chart package validation from component orchestration", () => {
  const componentImporter = fs.readFileSync(componentImporterFile, "utf8");
  const chartImporter = fs.readFileSync(portableChartImporterFile, "utf8");
  assert.match(componentImporter, /OpenXmlPortableChartImporter\.Validate/);
  assert.match(componentImporter, /OpenXmlPortableChartImporter\.Copy/);
  assert.doesNotMatch(componentImporter, /ZipArchive|SpreadsheetDocument\.Open|ValidateWorkbook/);
  assert.match(chartImporter, /ZipArchive/);
  assert.match(chartImporter, /SpreadsheetDocument\.Open/);
  assert.match(chartImporter, /TargetMode/);
  assert.match(chartImporter, /OpenXmlPortableChartDrawingImporter\.Validate/);
  assert.match(chartImporter, /OpenXmlPortableChartDrawingImporter\.Copy/);
  const chartDrawingImporter = fs.readFileSync(portableChartDrawingImporterFile, "utf8");
  const imageValidator = fs.readFileSync(portableImageValidatorFile, "utf8");
  assert.match(chartDrawingImporter, /MaximumTotalImageBytes/);
  assert.match(chartDrawingImporter, /PortableImageValidator\.Validate/);
  assert.match(imageValidator, /ReadExactly/);
});

test("OpenXmlDeckBuilder admits PPTX packages before the Open XML SDK opens them", () => {
  const componentImporter = fs.readFileSync(componentImporterFile, "utf8");
  const admission = fs.readFileSync(packageAdmissionFile, "utf8");
  assert.ok(componentImporter.indexOf("PptxPackageAdmissionValidator.Validate(sourceDeck") < componentImporter.indexOf("ProcessOperations("));
  assert.match(admission, /MaximumEntries/);
  assert.match(admission, /MaximumEntryBytes/);
  assert.match(admission, /MaximumExpandedBytes/);
  assert.match(admission, /MaximumCompressionRatio/);
  assert.match(admission, /duplicate ZIP entry name/);
  assert.match(admission, /unsafe ZIP entry path/);
});

test("OpenXmlDeckBuilder applies the stricter executable-content and external-relationship policy only to templates", () => {
  const validator = fs.readFileSync(packageAdmissionFile, "utf8");
  const writer = fs.readFileSync(deckPackageWriterFile, "utf8");
  assert.match(validator, /ValidateTemplate/);
  assert.match(validator, /vbaProject/);
  assert.match(validator, /activeX/);
  assert.match(validator, /embeddings/);
  assert.match(validator, /TargetMode/);
  assert.match(writer, /ValidateTemplate\(templatePath\)/);
});

test("OpenXmlDeckBuilder isolates the bounded SmartArt part graph from component orchestration", () => {
  const componentImporter = fs.readFileSync(componentImporterFile, "utf8");
  const smartArtImporter = fs.readFileSync(portableSmartArtImporterFile, "utf8");
  const imageValidator = fs.readFileSync(portableImageValidatorFile, "utf8");
  assert.match(componentImporter, /OpenXmlPortableSmartArtImporter\.Validate/);
  assert.match(componentImporter, /OpenXmlPortableSmartArtImporter\.Copy/);
  assert.match(smartArtImporter, /DiagramDataPart/);
  assert.match(smartArtImporter, /DiagramLayoutDefinitionPart/);
  assert.match(smartArtImporter, /DiagramStylePart/);
  assert.match(smartArtImporter, /DiagramColorsPart/);
  assert.match(smartArtImporter, /DiagramPersistLayoutPart/);
  assert.match(smartArtImporter, /DtdProcessing\.Prohibit/);
  assert.match(smartArtImporter, /dataModelExt/);
  assert.match(smartArtImporter, /MaximumTotalImageBytes/);
  assert.match(smartArtImporter, /PortableImageValidator\.Validate/);
  assert.match(imageValidator, /ValidateJpeg/);
  assert.match(smartArtImporter, /copiedImages/);
});

test("Docker and host modes execute the same OpenXmlDeckBuilder implementation", () => {
  const root = path.join(__dirname, "..");
  const adapter = fs.readFileSync(path.join(root, "skills", "pd-hifi-slideclone", "scripts", "adapters", "pptx-openxml-dotnet.js"), "utf8");
  const dockerfile = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable"), "utf8");
  assert.match(adapter, /path\.join\(context\.skillRoot, "dotnet", "OpenXmlDeckBuilder"\)/);
  assert.match(adapter, /process\.env\.OPENXML_BUILDER_EXE/);
  assert.match(dockerfile, /COPY skills\/pd-hifi-slideclone\/dotnet\/OpenXmlDeckBuilder \.\/OpenXmlDeckBuilder/);
  assert.match(dockerfile, /ENV OPENXML_BUILDER_EXE=\/opt\/openxml\/OpenXmlDeckBuilder/);
  assert.ok(dockerfile.indexOf("OpenXmlDeckBuilder.csproj") < dockerfile.indexOf("dotnet restore"));
  assert.ok(dockerfile.indexOf("dotnet restore") < dockerfile.lastIndexOf("COPY skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder ./OpenXmlDeckBuilder"));
  assert.doesNotMatch(dockerfile, /PowerPoint|Aspose|OfficePLUS|iSlide/i);
});

test("OpenXmlDeckBuilder keeps command parsing and batch orchestration outside the composition entry point", () => {
  const program = fs.readFileSync(programFile, "utf8");
  const commandLine = fs.readFileSync(commandLineFile, "utf8");
  const batchBuilder = fs.readFileSync(batchBuilderFile, "utf8");
  assert.doesNotMatch(program, /static Dictionary<string, string> ParseArgs/);
  assert.doesNotMatch(program, /static void BuildBatch/);
  assert.match(program, /CommandLineOptions\.Parse\(args\)/);
  assert.match(program, /DeckBatchBuilder\.Build/);
  assert.match(commandLine, /Duplicate command-line option/);
  assert.match(batchBuilder, /16 MiB limit/);
  assert.match(batchBuilder, /10000 job limit/);
  assert.ok(batchBuilder.indexOf("new FileInfo(batchFullPath).Length") < batchBuilder.indexOf("File.ReadAllText(batchFullPath)"));
});

test("OpenXmlDeckBuilder batch mode uses bounded resource-aware parallelism", () => {
  const batch = fs.readFileSync(path.join(path.dirname(programFile), "DeckBatchBuilder.cs"), "utf8");
  assert.match(batch, /Parallel\.ForEach/);
  assert.match(batch, /MaxDegreeOfParallelism/);
  assert.match(batch, /Batch concurrency must be between 1 and 8/);
  assert.match(batch, /ValidateDistinctOutputs/);
});

test("OpenXmlDeckBuilder rejects duplicate command options before any file access", () => {
  const result = invokeBuilder(["--ir", "first.json", "--ir", "second.json", "--out", "deck.pptx"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Duplicate command-line option: ir/);
  assert.doesNotMatch(result.stderr, /first\.json.*was not found/);
});

test("OpenXmlDeckBuilder rejects invalid bounded Deck IR before creating output", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-invalid-ir-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 0, heightPt: 540 },
    pages: [{ pageIndex: 0 }]
  }));

  const result = invokeBuilder(["--ir", irFile, "--out", pptxFile]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /slideSize must contain bounded positive dimensions/);
  assert.equal(fs.existsSync(pptxFile), false);

  fs.writeFileSync(irFile, JSON.stringify({
    version: "2.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0 }]
  }));
  const versionResult = invokeBuilder(["--ir", irFile, "--out", pptxFile]);
  assert.notEqual(versionResult.status, 0);
  assert.match(versionResult.stderr, /Deck IR version must be 1\.0/);

  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: -1 }]
  }));
  const pageResult = invokeBuilder(["--ir", irFile, "--out", pptxFile]);
  assert.notEqual(pageResult.status, 0);
  assert.match(pageResult.stderr, /pageIndex values must be between 0 and 9999/);
  assert.equal(fs.existsSync(pptxFile), false);
});

test("OpenXmlDeckBuilder supports high-fidelity table overlay IR fields", () => {
  const source = fs.readFileSync(nativeTableWriterFile, "utf8");

  assert.match(source, /UsesOverlayText\(table\.Style\)/);
  assert.match(source, /UsesOverlayGrid\(table\.Style\)/);
  assert.match(source, /TextOverlays\(VisualElementIr table\)/);
  assert.match(source, /GridOverlays\(VisualElementIr table\)/);
  assert.match(source, /Fill\(GetString\(cellStyle, "fill"\) \?\? \(isHeader \? headerFill : fill\)\)/);
  for (const edge of ["strokeLeft", "strokeRight", "strokeTop", "strokeBottom"]) assert.match(source, new RegExp(`Border\\(overlayGrid \\? "none" : GetString\\(cellStyle, "${edge}"\\)`));
  assert.match(source, /IsNone\(color\) \|\| width <= 0/);
});

test("both PPTX builders support native table dimensions and per-cell styles", () => {
  const source = fs.readFileSync(nativeTableWriterFile, "utf8");
  const pythonSource = fs.readFileSync(pythonBuilderFile, "utf8");

  assert.match(source, /Dimensions\(table\.Style, "columnWidthsPt"/);
  assert.match(source, /Dimensions\(table\.Style, "rowHeightsPt"/);
  assert.match(source, /TextOverlays[\s\S]*CellStyle\(table\.Style, rowIndex, columnIndex\)/);
  assert.match(source, /CellStyle\(table\.Style, rowIndex, columnIndex\)/);
  assert.match(source, /GetString\(cellStyle, "fill"\)/);
  assert.match(pythonSource, /normalized_table_dimensions\(style\.get\("columnWidthsPt"\)/);
  assert.match(pythonSource, /normalized_table_dimensions\(style\.get\("rowHeightsPt"\)/);
  assert.match(pythonSource, /table_cell_style\(style, row_index, col_index\)/);
  assert.match(pythonSource, /cell_style\.get\("fill"\)/);
});

test("OpenXmlDeckBuilder writes the theme at the presentation-level package path", () => {
  const writer = fs.readFileSync(deckPackageWriterFile, "utf8");
  const services = fs.readFileSync(packageServicesFile, "utf8");

  assert.match(writer, /PresentationPackageServices\.AddTheme\(presentationPart, masterPart\)/);
  assert.match(services, /PresentationPart presentationPart, SlideMasterPart masterPart/);
  assert.match(services, /presentationPart\.AddNewPart<ThemePart>\("rIdTheme"\)/);
  assert.match(services, /masterPart\.AddPart\(themePart, "rIdTheme"\)/);
});

test("OpenXmlDeckBuilder delegates package validation and content type repair", () => {
  const source = fs.readFileSync(programFile, "utf8");
  const writer = fs.readFileSync(deckPackageWriterFile, "utf8");
  const services = fs.readFileSync(packageServicesFile, "utf8");
  assert.doesNotMatch(source, /new OpenXmlValidator/);
  assert.doesNotMatch(source, /ZipFile\.Open/);
  assert.match(writer, /PresentationPackageServices\.Validate/);
  assert.match(writer, /PresentationPackageServices\.FixContentTypes/);
  assert.match(services, /new OpenXmlValidator/);
  assert.match(services, /ZipFile\.Open/);
});

test("OpenXmlDeckBuilder uses deterministic package relationship ids", () => {
  const packageSource = fs.readFileSync(deckPackageWriterFile, "utf8");
  const objectWriterSource = fs.readFileSync(programFile, "utf8");
  const chartWriterSource = fs.readFileSync(nativeChartWriterFile, "utf8");

  assert.match(packageSource, /ChangeIdOfPart\(presentationPart, "rIdPresentation"\)/);
  assert.match(packageSource, /layoutPart\.AddPart\(masterPart, "rIdMaster"\)/);
  assert.match(packageSource, /AddNewPart<SlidePart>\(\$"rIdSlide\{slideId\}"\)/);
  assert.match(packageSource, /slidePart\.AddPart\(layoutPart, "rIdLayout"\)/);
  assert.match(objectWriterSource, /AddImagePart\(GetImagePartType\(assetPath\), \$"rIdImage\{shapeId\}"\)/);
  assert.match(chartWriterSource, /AddNewPart<ChartPart>\(\$"rIdChart\{shapeId\}"\)/);
  assert.match(chartWriterSource, /AddEmbeddedPackagePart\([^\n]+, "rIdWorkbook1"\)/);
  assert.match(fs.readFileSync(portableChartImporterFile, "utf8"), /OpenXmlRelationshipIdAllocator\.Next\(targetSlide, "rIdImportedChart"/);
});

test("OpenXmlDeckBuilder writes the slide-layout back-reference required by PowerPoint", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-layout-master-rel-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      images: [],
      shapes: [],
      textBoxes: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const relationships = readZipEntry(pptxFile, "ppt/slideLayouts/_rels/slideLayout1.xml.rels").toString("utf8");
  assert.match(relationships, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/slideMaster"/);
  assert.match(relationships, /Target="\/ppt\/slideMasters\/slideMaster1\.xml"/);
  assert.match(relationships, /Id="rIdMaster"/);
});

test("OpenXmlDeckBuilder can rebuild content on a trusted PPTX template without replacing its master", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-template-rebuild-"));
  const templateIr = path.join(tmp, "template.ir.json");
  const templatePptx = path.join(tmp, "template.pptx");
  const targetIr = path.join(tmp, "target.ir.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const templateDeck = createMinimalDeckIr("template");
  templateDeck.pages.push({
    ...createMinimalDeckIr("template-second").pages[0],
    pageIndex: 1
  });
  fs.writeFileSync(templateIr, JSON.stringify(templateDeck));
  fs.writeFileSync(targetIr, JSON.stringify(createMinimalDeckIr("rebuilt")));

  runBuilder(["--ir", templateIr, "--out", templatePptx, "--powerpoint-safe", "false"]);
  const templateMaster = readZipEntry(templatePptx, "ppt/slideMasters/slideMaster1.xml").toString("utf8");
  // This contract isolates template preservation; PowerPoint-safe normalization
  // has its own coverage and may canonicalize master-part names.
  runBuilder(["--ir", targetIr, "--out", targetPptx, "--template-pptx", templatePptx, "--powerpoint-safe", "false"]);

  const targetMaster = readZipEntry(targetPptx, "ppt/slideMasters/slideMaster1.xml").toString("utf8");
  const presentation = readZipEntry(targetPptx, "ppt/presentation.xml").toString("utf8");
  const generatedSlide = listZipEntries(targetPptx)
    .map((entry) => entry.name)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort()[0];
  assert.ok(generatedSlide, "expected a generated slide part in the template-backed deck");
  const slide = readZipEntry(targetPptx, generatedSlide).toString("utf8");
  assert.equal(targetMaster, templateMaster);
  assert.equal(countMatches(presentation, /<p:sldId\b/g), 1);
  assert.match(slide, /rebuilt/);
});

test("OpenXmlDeckBuilder writes hybrid fidelity crops below native overlays", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-native-overlay-order-"));
  const imageFile = path.join(tmp, "underlay.png");
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(imageFile, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8fK8QAAAABJRU5ErkJggg==",
    "base64"
  ));
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      images: [{
        id: "hybrid-underlay",
        type: "fidelity-crop",
        assetPath: "underlay.png",
        box: { x: 100, y: 100, w: 300, h: 200 },
        source: {
          componentRenderStrategy: { mode: "preserve-crop-with-native-overlays" }
        }
      }],
      shapes: [{
        id: "native-overlay",
        type: "roundRect",
        box: { x: 140, y: 130, w: 180, h: 80 },
        style: { fill: "#FFFFFF", stroke: "#2F80ED" }
      }],
      textBoxes: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const underlayIndex = slideXml.indexOf('name="hybrid-underlay"');
  const overlayIndex = slideXml.indexOf('name="native-overlay"');
  assert.ok(underlayIndex >= 0, "expected hybrid underlay picture");
  assert.ok(overlayIndex > underlayIndex, "expected native overlay above the fidelity crop");
});


test("OpenXmlDeckBuilder writes textbox typeface and vertical alignment", () => {
  const source = fs.readFileSync(programFile, "utf8");

  assert.match(source, /AppendTypeface\(properties, runFont\?\.Family \?\? effectiveFont\?\.Family\)/);
  assert.match(source, /Anchor = TextAnchor\(effectiveFont\?\.Valign\)/);
  assert.match(source, /new A\.LatinFont \{ Typeface = family \}/);
  assert.match(source, /new A\.EastAsianFont \{ Typeface = family \}/);
  assert.match(source, /new A\.ComplexScriptFont \{ Typeface = family \}/);
  assert.match(source, /LeftInset = TextInset\(textBox\.Style, "marginLeftPt"\)/);
  assert.match(source, /RightInset = TextInset\(textBox\.Style, "marginRightPt"\)/);
});

test("OpenXmlDeckBuilder supports bounded editable rich text runs", () => {
  const source = fs.readFileSync(programFile, "utf8");
  const models = fs.readFileSync(modelsFile, "utf8");

  assert.match(models, /List<TextRunIr>\? Runs = null/);
  assert.match(source, /\.Take\(128\)/);
  assert.match(source, /CreateRunProperties\(run\.Font\)/);
  assert.match(source, /new A\.Text\(run\.Text\)/);
});

test("OpenXmlDeckBuilder honors legacy style.wrap without a typed wrap field", () => {
  const source = fs.readFileSync(programFile, "utf8");

  assert.match(source, /var wrap = textBox\.Wrap \?\? GetBoolean\(textBox\.Style, "wrap"\);/);
  assert.match(source, /Wrap = wrap == false \? A\.TextWrappingValues\.None : A\.TextWrappingValues\.Square/);
});

test("OpenXmlDeckBuilder hydrates legacy style font fields at the IR boundary", () => {
  const source = fs.readFileSync(programFile, "utf8");

  assert.match(source, /var effectiveFont = ResolveTextBoxFont\(textBox\);/);
  assert.match(source, /GetString\(textBox\.Style, "fontFace"\)/);
  assert.match(source, /GetNumber\(textBox\.Style, "sizePt"\)/);
  assert.match(source, /GetBoolean\(textBox\.Style, "bold"\) == true/);
  assert.match(source, /string\.Equals\(value, "mid", StringComparison\.OrdinalIgnoreCase\)/);
});

test("OpenXmlDeckBuilder writes textbox rotation as DrawingML transform rotation", () => {
  const source = fs.readFileSync(programFile, "utf8");
  const models = fs.readFileSync(modelsFile, "utf8");

  assert.match(models, /public sealed record TextBoxIr\([\s\S]*double\? Rotation = null,[\s\S]*JsonElement\? Source = null[\s\S]*\);/);
  assert.match(source, /var transform = new A\.Transform2D\(/);
  assert.match(source, /Math\.Abs\(textBox\.Rotation \?\? 0\) > 0\.001/);
  assert.match(source, /transform\.Rotation = ToOpenXmlAngle\(textBox\.Rotation!\.Value\)/);
  assert.match(source, /static int ToOpenXmlAngle\(double degrees\) => \(int\)Math\.Round\(degrees \* 60000\)/);
});

test("OpenXmlDeckBuilder writes native shape rotation and flips into DrawingML", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-shape-transform-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [{
        id: "transformed-component-shape",
        type: "roundRect",
        box: { x: 100, y: 100, w: 160, h: 80 },
        style: { fill: "#185ABD", rotation: 90, flipH: true, flipV: true }
      }],
      textBoxes: [],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const shapeStart = slideXml.indexOf('name="transformed-component-shape"');
  assert.ok(shapeStart >= 0);
  const shapeXml = slideXml.slice(shapeStart, slideXml.indexOf("</p:sp>", shapeStart));
  assert.match(shapeXml, /<a:xfrm\b[^>]*\brot="5400000"/);
  assert.match(shapeXml, /<a:xfrm\b[^>]*\bflipH="1"/);
  assert.match(shapeXml, /<a:xfrm\b[^>]*\bflipV="1"/);
});

test("OpenXmlDeckBuilder accepts the legacy rotate style alias", () => {
  const source = fs.readFileSync(programFile, "utf8");
  assert.match(source, /GetNumber\(element\.Style, "rotation"\) \?\? GetNumber\(element\.Style, "rotate"\)/);
});

test("OpenXmlDeckBuilder writes learned text gradient reflection and line spacing into DrawingML", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-text-effects-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [],
      textBoxes: [{
        id: "learned-text-effect",
        text: "1",
        box: { x: 100, y: 100, w: 100, h: 120 },
        font: {
          family: "Microsoft YaHei",
          sizePt: 72,
          weight: "bold",
          color: "#156082",
          align: "center",
          valign: "bottom",
          lineHeightMultiple: 1.5
        },
        style: {
          textGradient: {
            type: "linear",
            angleDeg: 90,
            stops: [
              { position: 0.12, color: "#156082", alpha: 0.7 },
              { position: 0.87, color: "#156082", alpha: 0 }
            ]
          },
          textReflection: {
            blurPt: 1,
            startAlpha: 0.6,
            endAlpha: 0.009,
            endPosition: 0.48,
            directionDeg: 90,
            scaleY: -1,
            alignment: "bl",
            rotateWithShape: false
          }
        }
      }],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const textStart = slideXml.indexOf('name="learned-text-effect"');
  assert.ok(textStart >= 0);
  const textXml = slideXml.slice(textStart, slideXml.indexOf("</p:sp>", textStart));
  assert.match(textXml, /<a:gradFill\b[^>]*\brotWithShape="1"/);
  assert.match(textXml, /<a:gs\b[^>]*\bpos="12000"/);
  assert.match(textXml, /<a:alpha\b[^>]*\bval="70000"/);
  assert.match(textXml, /<a:reflection\b[^>]*\bblurRad="12700"/);
  assert.match(textXml, /<a:reflection\b[^>]*\bstA="60000"/);
  assert.match(textXml, /<a:reflection\b[^>]*\bsy="-100000"/);
  assert.match(textXml, /<a:reflection\b[^>]*\balgn="bl"/);
  assert.match(textXml, /<a:lnSpc><a:spcPct\b[^>]*\bval="150000"/);
});

test("OpenXmlDeckBuilder preserves hidden OCR text as transparent editable text", () => {
  const source = fs.readFileSync(programFile, "utf8");
  const models = fs.readFileSync(modelsFile, "utf8");

  assert.match(source, /var opacity = TextOpacity\(textBox\)/);
  assert.match(source, /GetString\(textBox\.Style, "visibility"\)/);
  assert.match(source, /GetNumber\(textBox\.Style, "opacity"\)/);
  assert.match(source, /textBox\.Font\?\.Opacity \?\? 1/);
  assert.match(source, /rgb\.Append\(new A\.Alpha \{ Val = ToAlpha\(runOpacity\) \}\)/);
  assert.match(models, /public sealed record TextBoxIr\([\s\S]*double\? Rotation = null,[\s\S]*JsonElement\? Source = null[\s\S]*\);/);
  assert.match(models, /public sealed record FontIr\(string\? Family, double\? SizePt, string\? Weight, string\? Color, string\? Align, string\? Valign, double\? LineHeightMultiple, double\? Opacity = null\)/);
});

test("OpenXmlDeckBuilder preserves component replacement metadata in drawing descriptions", () => {
  const source = fs.readFileSync(programFile, "utf8");

  assert.match(source, /BuildComponentReplacementDescription\(metadata\)/);
  assert.match(source, /properties\.Description = description/);
  assert.match(source, /textBox\.Source \?\? textBox\.Style/);
  assert.match(source, /componentReplacementCandidateId/);
  assert.match(source, /SanitizeMetadataValue/);
});

test("python-pptx builder writes component replacement metadata to cNvPr descriptions", () => {
  const source = fs.readFileSync(pythonBuilderFile, "utf8");

  assert.match(source, /def apply_component_replacement_metadata\(shape, item\):/);
  assert.match(source, /c_nv_pr\.set\("descr", description\)/);
  assert.match(source, /build_component_replacement_description\(item\.get\("source"\) or item\.get\("style"\) or \{\}\)/);
  assert.match(source, /sanitize_metadata_value/);
});

test("OpenXmlDeckBuilder emits component replacement anchors into PPTX XML", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-replacement-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  const replacementPlan = {
    provider: "plugin-component-template-replacement-plan-v1",
    layerKey: "0:0",
    sourceProvider: "officeplus",
    componentKind: "component",
    componentId: "MatlComponentContent-11189",
    suitabilityTier: "strong",
    suitabilityScore: 96
  };
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [{
        id: "replacement-shape",
        type: "rect",
        box: { x: 100, y: 100, w: 120, h: 80 },
        style: { fill: "#EAF4FF", stroke: "#0A67BD", strokeWidthPt: 1 },
        source: { componentReplacementPlan: replacementPlan }
      }],
      textBoxes: [{
        id: "replacement-text",
        text: "文档",
        box: { x: 115, y: 120, w: 90, h: 30 },
        font: { family: "Microsoft YaHei", sizePt: 18, color: "#083354", align: "center", valign: "middle" },
        source: {
          componentReplacementPlan: replacementPlan,
          componentReplacementCandidateId: "MatlComponentContent-11189"
        }
      }],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  assert.match(slideXml, /descr="slideclone:componentReplacementPlan provider=officeplus kind=component id=MatlComponentContent-11189 layer=0:0 tier=strong score=96"/);
  assert.equal((slideXml.match(/slideclone:componentReplacementPlan/g) || []).length, 2);
});

test("OpenXmlDeckBuilder emits native connector shapes with semantic anchors", () => {
  const source = fs.readFileSync(programFile, "utf8");

  assert.match(source, /P\.ConnectionShape CreateConnectionShape\(VisualElementIr element, uint shapeId, IReadOnlyDictionary<string, BoxIr>\? boxIndex\)/);
  assert.match(source, /BuildBoxIndex\(page\)/);
  assert.match(source, /ResolveAnchor\(GetObject\(element\.Style, "startAnchor"\)/);
  assert.match(source, /ResolveAnchor\(GetObject\(element\.Style, "endAnchor"\)/);
  assert.match(source, /SafeConnectorExtent\(Math\.Abs\(end\.X - start\.X\)\)/);
  assert.match(source, /SafeConnectorExtent\(Math\.Abs\(end\.Y - start\.Y\)\)/);
  assert.match(source, /A\.ShapeTypeValues\.BentConnector2/);
  assert.match(source, /"elbow-3" => A\.ShapeTypeValues\.BentConnector3/);
  assert.match(source, /"elbow-4" => A\.ShapeTypeValues\.BentConnector4/);
  assert.match(source, /"elbow-5" => A\.ShapeTypeValues\.BentConnector5/);
  assert.match(source, /new P\.NonVisualConnectionShapeProperties/);
  assert.match(source, /new A\.HeadEnd \{ Type = A\.LineEndValues\.Triangle \}/);
  assert.match(source, /new A\.TailEnd \{ Type = A\.LineEndValues\.Triangle \}/);
});

test("OpenXmlDeckBuilder clamps zero-size connector extents for renderer compatibility", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-zero-connector-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [
        {
          id: "vertical-line",
          type: "line",
          box: { x: 100, y: 100, w: 0, h: 120 },
          style: { stroke: "#123456", strokeWidthPt: 1 }
        },
        {
          id: "horizontal-line",
          type: "line",
          box: { x: 140, y: 160, w: 200, h: 0 },
          style: { stroke: "#123456", strokeWidthPt: 1 }
        }
      ],
      textBoxes: [],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const masterRels = readZipEntry(pptxFile, "ppt/slideMasters/_rels/slideMaster1.xml.rels").toString("utf8");
  const contentTypes = readZipEntry(pptxFile, "[Content_Types].xml").toString("utf8");
  assert.ok(readZipEntry(pptxFile, "ppt/theme/theme1.xml").length > 0);
  assert.match(masterRels, /Target="\/ppt\/theme\/theme1\.xml"/);
  assert.match(contentTypes, /PartName="\/ppt\/theme\/theme1\.xml"/);
  const extents = [...slideXml.matchAll(/<a:ext cx="(\d+)" cy="(\d+)"/g)]
    .map((match) => ({ cx: Number(match[1]), cy: Number(match[2]) }));
  assert.ok(extents.some((extent) => extent.cx > 0 && extent.cy > 0), "expected positive connector extents");
  assert.equal(extents.some((extent) => extent.cx === 0 || extent.cy === 0), false);
});

test("OpenXmlDeckBuilder emits editable custom geometry for freeform IR", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-freeform-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [{
        id: "islide-custom-arrow",
        type: "freeform",
        box: { x: 100, y: 120, w: 200, h: 140 },
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0.2 },
          { x: 0.66, y: 1 },
          { x: 0, y: 0 }
        ],
        style: {
          fill: "#FD6D25",
          stroke: "none",
          closePath: true,
          gradient: {
            type: "linear",
            angleDeg: 90,
            stops: [
              { position: 0, color: "#FEA77C" },
              { position: 1, color: "#FD6D25" }
            ]
          },
          freeformSegments: [
            { type: "moveTo", points: [{ x: 0, y: 0 }] },
            {
              type: "cubicBezTo",
              points: [
                { x: 0.35, y: 0.05 },
                { x: 0.85, y: 0.55 },
                { x: 0.66, y: 1 }
              ]
            },
            { type: "lnTo", points: [{ x: 0, y: 0 }] },
            { type: "close", points: [] }
          ]
        }
      }, {
        id: "segment-only-arc",
        type: "freeform",
        box: { x: 360, y: 120, w: 180, h: 180 },
        style: {
          fill: "none",
          stroke: "#34C76B",
          strokeWidthPt: 10,
          closePath: false,
          endArrow: "triangle",
          freeformSegments: [
            { type: "moveTo", points: [{ x: 0.1, y: 0.5 }] },
            {
              type: "cubicBezTo",
              points: [
                { x: 0.1, y: 0.28 },
                { x: 0.28, y: 0.1 },
                { x: 0.5, y: 0.1 }
              ]
            }
          ]
        }
      }, {
        id: "style-points-arrow",
        type: "freeform",
        box: { x: 580, y: 120, w: 160, h: 90 },
        style: {
          fill: "#35B966",
          stroke: "none",
          points: [
            { x: 0, y: 0.25 },
            { x: 0.68, y: 0.25 },
            { x: 0.68, y: 0 },
            { x: 1, y: 0.5 },
            { x: 0.68, y: 1 },
            { x: 0.68, y: 0.75 },
            { x: 0, y: 0.75 }
          ]
        }
      }],
      textBoxes: [],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  assert.match(slideXml, /<a:custGeom\b/);
  assert.match(slideXml, /<a:pathLst>/);
  assert.match(slideXml, /<a:moveTo><a:pt x="0" y="0" \/><\/a:moveTo>/);
  assert.match(slideXml, /<a:lnTo><a:pt x="0" y="0" \/><\/a:lnTo>/);
  assert.match(slideXml, /<a:close \/>/);
  const freeformShapeXml = slideXml.slice(slideXml.indexOf('name="islide-custom-arrow"'));
  assert.match(freeformShapeXml, /<a:cubicBezTo>/);
  assert.match(freeformShapeXml, /<a:pt x="7560" y="1080" \/>/);
  assert.doesNotMatch(freeformShapeXml, /<a:prstGeom[^>]+prst="rect"/);
  assert.match(freeformShapeXml, /<a:gradFill\b/);
  assert.match(freeformShapeXml, /<a:srgbClr val="FEA77C"/);
  assert.match(freeformShapeXml, /<a:srgbClr val="FD6D25"/);
  const segmentOnlyShapeXml = slideXml.slice(slideXml.indexOf('name="segment-only-arc"'));
  assert.match(segmentOnlyShapeXml, /<a:custGeom\b/);
  assert.match(segmentOnlyShapeXml, /<a:cubicBezTo>/);
  assert.doesNotMatch(segmentOnlyShapeXml, /<a:prstGeom[^>]+prst="rect"/);
  assert.match(segmentOnlyShapeXml, /<a:tailEnd type="triangle"/);
  const stylePointsShapeXml = slideXml.slice(slideXml.indexOf('name="style-points-arrow"'));
  assert.match(stylePointsShapeXml, /<a:custGeom\b/);
  assert.match(stylePointsShapeXml, /<a:pt x="21600" y="10800" \/>/);
  assert.doesNotMatch(stylePointsShapeXml, /<a:prstGeom[^>]+prst="rect"/);
});

test("OpenXmlDeckBuilder writes a native gradient outline without fragmenting the shape", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-gradient-outline-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [{
        id: "minimum-unit-gradient-ring",
        type: "ellipse",
        box: { x: 300, y: 100, w: 320, h: 320 },
        style: {
          fill: "none",
          stroke: "#3A969A",
          strokeWidthPt: 8,
          strokeGradient: {
            type: "linear",
            angleDeg: 0,
            stops: [
              { position: 0, color: "#3974EA" },
              { position: 0.5, color: "#3A9A9D" },
              { position: 1, color: "#3AB873" }
            ]
          }
        }
      }],
      textBoxes: [],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const ringXml = slideXml.slice(slideXml.indexOf('name="minimum-unit-gradient-ring"'));
  const outlineXml = ringXml.slice(ringXml.indexOf("<a:ln"), ringXml.indexOf("</a:ln>") + "</a:ln>".length);
  assert.match(outlineXml, /<a:gradFill\b/);
  assert.match(outlineXml, /<a:srgbClr val="3974EA"/);
  assert.match(outlineXml, /<a:srgbClr val="3AB873"/);
  assert.doesNotMatch(ringXml.slice(0, ringXml.indexOf("<a:ln")), /<a:gradFill\b/);
});

test("OpenXmlDeckBuilder applies IR opacity to solid shape fills", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-solid-fill-opacity-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [{
        id: "translucent-terminal-node",
        type: "ellipse",
        box: { x: 100, y: 100, w: 80, h: 80 },
        style: { fill: "#4381DD", stroke: "none", opacity: 0.1 }
      }],
      textBoxes: [],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const nodeXml = slideXml.slice(slideXml.indexOf('name="translucent-terminal-node"'));
  assert.match(nodeXml, /<a:solidFill\b[^>]*><a:srgbClr val="4381DD"><a:alpha val="10000" \/><\/a:srgbClr><\/a:solidFill>/);
});

test("OpenXmlDeckBuilder writes East Asian vertical textbox flow from IR style", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-vertical-text-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [],
      textBoxes: [{
        id: "east-asian-vertical-title",
        text: "新品上市整体策略",
        box: { x: 60, y: 100, w: 50, h: 220 },
        font: { sizePt: 15, weight: "bold", color: "#111111", align: "center", valign: "middle" },
        style: { vertical: "eavert" }
      }],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const textXml = slideXml.slice(slideXml.indexOf('name="east-asian-vertical-title"'));
  assert.match(textXml, /<a:bodyPr[^>]* vert="eaVert"/);
});

test("OpenXmlDeckBuilder writes shape shadows and picture crop rectangles", () => {
  const source = fs.readFileSync(programFile, "utf8");

  assert.match(source, /CreateShapeFill\(element\.Style\)/);
  assert.match(source, /CreateGradientFill\(GetObject\(style, "gradient"\)\)/);
  assert.match(source, /AppendEffectList\(shapeProperties, element\.Style\)/);
  assert.match(source, /new A\.EffectList\(CreateOuterShadow\(shadow\)\)/);
  assert.match(source, /new A\.OuterShadow\(rgb\)/);
  assert.match(source, /new A\.Alpha \{ Val = alpha \}/);
  assert.match(source, /CreateSourceRectangle\(VisualElementIr element\)/);
  assert.match(source, /new A\.SourceRectangle/);
  assert.match(source, /GetObject\(element\.Style, "cropRect"\)/);
  assert.match(source, /blipFill\.Append\(sourceRectangle\)/);
});

test("OpenXmlDeckBuilder maps editable primitive shape variants", () => {
  const source = fs.readFileSync(programFile, "utf8");

  assert.match(source, /ToShapeType\(GetString\(element\.Style, "shapeType"\) \?\? element\.Type\)/);
  assert.match(source, /preset == A\.ShapeTypeValues\.Arc \? new A\.NoFill\(\) : CreateShapeFill\(element\.Style\)/);
  assert.match(source, /"roundrect" or "rounded-rect" or "roundedRectangle" or "phone" or "mobile" or "device-phone" => A\.ShapeTypeValues\.RoundRectangle/);
  assert.match(source, /"triangle" => A\.ShapeTypeValues\.Triangle/);
  assert.match(source, /"right-triangle" or "righttriangle" => A\.ShapeTypeValues\.RightTriangle/);
  assert.match(source, /"wedgerectcallout" or "wedge-rect-callout" => A\.ShapeTypeValues\.WedgeRectangleCallout/);
  assert.match(source, /"largedashdot" => A\.PresetLineDashValues\.LargeDashDot/);
  assert.match(source, /"diamond" => A\.ShapeTypeValues\.Diamond/);
  assert.match(source, /"funnel" or "filter-funnel" => A\.ShapeTypeValues\.Funnel/);
  assert.match(source, /"donut" or "ring" => A\.ShapeTypeValues\.Donut/);
  assert.match(source, /"gear" or "gear6" or "six-tooth-gear" => A\.ShapeTypeValues\.Gear6/);
  assert.match(source, /"gear9" or "nine-tooth-gear" => A\.ShapeTypeValues\.Gear9/);
  assert.match(source, /"blockArc" or "blockarc" or "block-arc" => A\.ShapeTypeValues\.BlockArc/);
  assert.match(source, /"circularArrow" or "circulararrow" or "circular-arrow" or "cycle-arrow" => A\.ShapeTypeValues\.CircularArrow/);
  assert.match(source, /"bentArrow" or "bentarrow" or "bent-arrow" => A\.ShapeTypeValues\.BentArrow/);
  assert.match(source, /"leftRightArrow" or "leftrightarrow" or "left-right-arrow" => A\.ShapeTypeValues\.LeftRightArrow/);
  assert.match(source, /"curvedRightArrow" or "curvedrightarrow" or "curved-right-arrow" => A\.ShapeTypeValues\.CurvedRightArrow/);
});

test("OpenXmlDeckBuilder turns chart IR into editable vector elements", () => {
  const source = fs.readFileSync(programFile, "utf8");
  const fallback = fs.readFileSync(editableChartFallbackWriterFile, "utf8");
  const models = fs.readFileSync(modelsFile, "utf8");

  assert.match(source, /foreach \(var chart in page\.Charts \?\? \[\]\)/);
  assert.match(source, /EditableChartFallbackWriter\.Create\(chart\)/);
  assert.match(fallback, /Values\(chart\)/);
  assert.match(fallback, /Labels\(chart, values\.Count\)/);
  assert.match(models, /public sealed record ChartIr/);
  assert.match(models, /public sealed record ChartSeriesIr/);
});

test("OpenXmlDeckBuilder emits native visual atoms as grouped PPT components", () => {
  const source = fs.readFileSync(programFile, "utf8");

  assert.match(source, /var groupedComponentIds = AppendGroupedShapes\(/);
  assert.match(source, /static \(HashSet<string> TextBoxIds, HashSet<string> ImageIds\) AppendGroupedShapes\(/);
  assert.match(source, /NativeComponentGroupId\(element\)/);
  assert.match(source, /GetString\(element\.Source, "nativeComponentGroupId"\)/);
  assert.match(source, /NativeTextBoxComponentGroupId\(element\)/);
  assert.match(source, /GetString\(textBox\.Style, "nativeComponentGroupId"\)/);
  assert.match(source, /if \(groupedComponentIds\.TextBoxIds\.Contains\(textBox\.Id\)\) continue/);
  assert.match(source, /if \(groupedComponentIds\.ImageIds\.Contains\(image\.Id\)\) continue/);
  assert.match(source, /new P\.GroupShape\(/);
  assert.match(source, /new P\.NonVisualGroupShapeProperties\(/);
  assert.match(source, /new P\.GroupShapeProperties\(new A\.TransformGroup\(/);
  assert.match(source, /new A\.ChildOffset/);
  assert.match(source, /new A\.ChildExtents/);
  assert.match(source, /group\.Append\(CreateTextBox\(textBox, shapeId\+\+\)\)/);
  assert.match(source, /group\.Append\(picture\)/);
});

test("OpenXmlDeckBuilder writes component text boxes inside the native PPT group", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-group-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [{
        id: "component-card",
        type: "roundrect",
        box: { x: 100, y: 80, w: 220, h: 90 },
        style: { fill: "#DDEBFF", stroke: "#3A6EA5", strokeWidth: 1 },
        source: { nativeComponentGroupId: "native-card-group" },
        assetPath: null,
        rows: null
      }],
      textBoxes: [{
        id: "component-card-label",
        text: "Native Group Label",
        box: { x: 124, y: 108, w: 172, h: 32 },
        font: { family: "Arial", sizePt: 16, weight: "bold", color: "#123456", align: "center", valign: "mid", lineHeightMultiple: 1 },
        style: { nativeComponentGroupId: "native-card-group" }
      }],
      images: [],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  assert.ok(fs.existsSync(pptxFile), "expected OpenXmlDeckBuilder to write a pptx");

  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const groupStart = slideXml.indexOf("<p:grpSp>");
  assert.notEqual(groupStart, -1, "expected a native group shape in slide XML");
  const groupEnd = slideXml.indexOf("</p:grpSp>", groupStart);
  assert.notEqual(groupEnd, -1, "expected the native group shape to be closed");
  const groupXml = slideXml.slice(groupStart, groupEnd);

  assert.match(groupXml, /name="native-card-group"/);
  assert.match(groupXml, /Native Group Label/);
  assert.equal(countMatches(groupXml, /<p:sp>/g), 2, "expected one component shape plus one grouped text box");
  assert.equal(countMatches(slideXml.slice(groupEnd), /Native Group Label/g), 0, "grouped text must not be duplicated outside the group");
});

test("OpenXmlDeckBuilder groups a fidelity crop and editable label as one mixed native component", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-mixed-component-group-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  const iconFile = path.join(tmp, "icon.png");
  fs.writeFileSync(iconFile, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  ));
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [],
      textBoxes: [{
        id: "mixed-label",
        text: "Mixed Native Component",
        box: { x: 180, y: 91.9, w: 220, h: 32 },
        font: { family: "Arial", sizePt: 16, weight: "bold", color: "#123456", align: "center", valign: "mid", lineHeightMultiple: 1 },
        style: { nativeComponentGroupId: "mixed-picture-label-group" }
      }],
      images: [{
        id: "mixed-icon",
        type: "fidelity-crop",
        box: { x: 100, y: 92, w: 56, h: 56 },
        assetPath: "icon.png",
        source: { nativeComponentGroupId: "mixed-picture-label-group" }
      }],
      tables: [],
      charts: []
    }]
  }, null, 2));

  runBuilder(["--ir", irFile, "--out", pptxFile]);
  const slideXml = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
  const groupStart = slideXml.indexOf("<p:grpSp>");
  const groupEnd = slideXml.indexOf("</p:grpSp>", groupStart);
  assert.notEqual(groupStart, -1, "expected a native mixed component group");
  assert.notEqual(groupEnd, -1, "expected the mixed component group to be closed");
  const groupXml = slideXml.slice(groupStart, groupEnd);
  assert.match(groupXml, /name="mixed-picture-label-group"/);
  assert.match(groupXml, /<p:pic>/);
  assert.match(groupXml, /Mixed Native Component/);
  assert.match(groupXml, /<a:off x="1268730" y="1165860"\s*\/>/);
  assert.match(groupXml, /<a:chOff x="1268730" y="1165860"\s*\/>/);
  assert.match(groupXml, /name="mixed-label"[\s\S]*?<a:off x="2286000" y="1167130"/);
  assert.equal(countMatches(slideXml.slice(groupEnd), /Mixed Native Component/g), 0);
});

test("OpenXmlDeckBuilder batch mode builds multiple PPTX files in one process", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-batch-build-"));
  const firstIr = path.join(tmp, "first.ir.json");
  const secondIr = path.join(tmp, "second.ir.json");
  const firstPptx = path.join(tmp, "first.pptx");
  const secondPptx = path.join(tmp, "second.pptx");
  fs.writeFileSync(firstIr, `${JSON.stringify(createMinimalDeckIr("First Batch Deck"), null, 2)}\n`, "utf8");
  fs.writeFileSync(secondIr, `${JSON.stringify(createMinimalDeckIr("Second Batch Deck"), null, 2)}\n`, "utf8");
  const manifestFile = path.join(tmp, "batch.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    jobs: [
      { ir: firstIr, out: firstPptx },
      { ir: secondIr, out: secondPptx }
    ]
  }, null, 2)}\n`, "utf8");

  const result = runBuilder(["--batch", manifestFile]);
  assert.ok(fs.existsSync(firstPptx), "expected first batch pptx");
  assert.ok(fs.existsSync(secondPptx), "expected second batch pptx");
  assert.match(readZipEntry(firstPptx, "ppt/slides/slide1.xml").toString("utf8"), /First Batch Deck/);
  assert.match(readZipEntry(secondPptx, "ppt/slides/slide1.xml").toString("utf8"), /Second Batch Deck/);
  const summary = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(summary.provider, "openxml-deck-builder-batch");
  assert.equal(summary.count, 2);
});

test("OpenXmlDeckBuilder imports tier-a components without PowerPoint and removes anchors", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-import-"));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const samplePptx = path.join(tmp, "sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  const planFile = path.join(tmp, "plan.json");
  const sampleImage = path.join(tmp, "pixel.png");
  fs.writeFileSync(sampleImage, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nQAAAABJRU5ErkJggg==", "base64"));
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  const sampleDeck = createComponentDeckIr({ sample: true });
  sampleDeck.pages[0].images.push({ id: "portable-sample-image", type: "image", box: { x: 260, y: 130, w: 40, h: 40 }, assetPath: sampleImage, style: {}, source: {} });
  fs.writeFileSync(sampleIr, JSON.stringify(sampleDeck), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", samplePptx]);
  fs.writeFileSync(planFile, JSON.stringify({
    pptx: targetPptx,
    operations: [{
      operation: "replace-anchor-group-with-component-sample",
      status: "ready",
      groupKey: "local:component:portable-card:0:0",
      provider: "local",
      componentId: "portable-card",
      layer: "0:0",
      slides: [1],
      target: { slide: 1, box: { x: 120, y: 100, w: 360, h: 220 } },
      sample: { provider: "local", path: samplePptx }
    }]
  }), "utf8");

  const result = runBuilder(["--apply-component-replacements-openxml", planFile, "--out", outPptx]);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  const slideXml = readZipEntry(outPptx, "ppt/slides/slide1.xml").toString("utf8");
  assert.equal(report.engine, "openxml");
  assert.equal(report.summary.applied, 1);
  assert.equal(report.operations[0].boundsIoU, 1);
  assert.doesNotMatch(slideXml, /slideclone:componentReplacementPlan/);
  assert.match(slideXml, /portable-sample-shape/);
  assert.match(slideXml, /Portable editable text/);
  assert.match(slideXml, /portable-sample-image/);
  assert.ok(listZipEntries(outPptx).some((entry) => /^ppt\/media\//.test(entry.name)));

  const badHashPlan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  badHashPlan.operations[0].sample.sha256 = "0".repeat(64);
  const badHashPlanFile = path.join(tmp, "bad-hash-plan.json");
  const badHashOut = path.join(tmp, "bad-hash-out.pptx");
  fs.writeFileSync(badHashPlanFile, JSON.stringify(badHashPlan), "utf8");
  const rejected = invokeBuilder(["--apply-component-replacements-openxml", badHashPlanFile, "--out", badHashOut]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /SHA-256 does not match/);
  assert.equal(fs.existsSync(badHashOut), false);
});

test("OpenXmlDeckBuilder rejects duplicate top-level PPTX entries before opening the package", { timeout: 60_000 }, () => {
  const fixture = createComponentReplacementFixture("openxml-package-admission-");
  const malformedPptx = path.join(fixture.tmp, "duplicate-entry.pptx");
  const entries = readZipEntries(fs.readFileSync(fixture.targetPptx), { maxEntryBytes: 128 * 1024 * 1024 });
  const outputEntries = entries.map((entry) => ({
    name: entry.name,
    data: readZipBufferEntry(fs.readFileSync(fixture.targetPptx), entry.name, { maxEntryBytes: 128 * 1024 * 1024 })
  }));
  outputEntries.push({ name: "[Content_Types].xml", data: outputEntries.find((entry) => entry.name === "[Content_Types].xml").data });
  writeStoredZipAtomic(malformedPptx, outputEntries);
  const plan = JSON.parse(fs.readFileSync(fixture.planFile, "utf8"));
  plan.pptx = malformedPptx;
  fs.writeFileSync(fixture.planFile, JSON.stringify(plan), "utf8");

  const result = invokeBuilder(["--apply-component-replacements-openxml", fixture.planFile, "--out", fixture.outPptx]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate ZIP entry name/);
  assert.equal(fs.existsSync(fixture.outPptx), false);
});

test("OpenXmlDeckBuilder fails closed when selected component shapes have slide-level animation", { timeout: 60_000 }, () => {
  const fixture = createComponentReplacementFixture("openxml-animation-boundary-");
  const animatedSample = path.join(fixture.tmp, "animated-sample.pptx");
  addSlideShapeTiming(fixture.samplePptx, animatedSample, "portable-sample-shape");
  const plan = JSON.parse(fs.readFileSync(fixture.planFile, "utf8"));
  plan.operations[0].sample.path = animatedSample;
  fs.writeFileSync(fixture.planFile, JSON.stringify(plan), "utf8");

  const result = invokeBuilder(["--apply-component-replacements-openxml", fixture.planFile, "--out", fixture.outPptx]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Animated component shapes are not supported/);
  assert.equal(fs.existsSync(fixture.outPptx), false);

  const reportResult = runBuilder(["--apply-component-replacements-openxml", fixture.planFile, "--out", fixture.outPptx, "--allow-missing"]);
  const report = JSON.parse(reportResult.stdout.trim().split(/\r?\n/u).at(-1));
  assert.equal(report.operations[0].reasonCode, "animated_component_not_portable");
  assert.equal(Number.isSafeInteger(report.operations[0].elapsedMs), true);
});

test("OpenXmlDeckBuilder imports self-contained native tables as editable graphic frames", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-table-"));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const samplePptx = path.join(tmp, "sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  const sample = createComponentDeckIr({});
  sample.pages[0].tables = [{ id: "portable-table", type: "table", box: { x: 10, y: 10, w: 300, h: 100 }, rows: [["Name", "Value"], ["Alpha", "42"]], style: {} }];
  fs.writeFileSync(sampleIr, JSON.stringify(sample), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", samplePptx]);
  fs.writeFileSync(planFile, JSON.stringify({
    pptx: targetPptx,
    operations: [{ status: "ready", groupKey: "portable-table", provider: "local", componentId: "portable-card", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 150 } }, sample: { path: samplePptx } }]
  }), "utf8");

  const result = runBuilder(["--apply-component-replacements-openxml", planFile, "--out", outPptx]);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  const slideXml = readZipEntry(outPptx, "ppt/slides/slide1.xml").toString("utf8");
  assert.equal(report.summary.applied, 1);
  assert.equal(report.operations[0].boundsIoU, 1);
  assert.match(slideXml, /<a:tbl>/);
  assert.match(slideXml, /portable-table/);
  assert.match(slideXml, /Alpha/);
  assert.doesNotMatch(slideXml, /slideclone:componentReplacementPlan/);
  assert.match(slideXml, /<p:xfrm><a:off\b[^>]*\bx="1270000"[^>]*\by="1270000"[^>]*\/><a:ext\b[^>]*\bcx="5715000"[^>]*\bcy="1905000"[^>]*\/><\/p:xfrm>/);
  assert.equal((slideXml.match(/<a:gridCol w="2857500"\s*\/>/g) || []).length, 2);
  assert.equal((slideXml.match(/<a:tr h="952500">/g) || []).length, 2);

  const sampleSha256 = crypto.createHash("sha256").update(fs.readFileSync(samplePptx)).digest("hex");
  const perfPlanFile = path.join(tmp, "perf-plan.json");
  const perfOperation = { status: "ready", groupKey: "hash-cache", provider: "local", componentId: "portable-card", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 150 } }, sample: { path: samplePptx, sha256: sampleSha256 } };
  fs.writeFileSync(perfPlanFile, JSON.stringify({ pptx: targetPptx, operations: [perfOperation, { ...perfOperation, groupKey: "hash-cache-second" }] }), "utf8");
  const dryRun = runBuilder(["--apply-component-replacements-openxml", perfPlanFile, "--dry-run", "true"]);
  const dryRunReport = JSON.parse(dryRun.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(dryRunReport.performance.uniqueSampleDecks, 1);
  assert.equal(dryRunReport.performance.sha256Computations, 1);

  const themedSamplePptx = path.join(tmp, "themed-sample.pptx");
  const sampleSlideXml = readZipEntry(samplePptx, "ppt/slides/slide1.xml").toString("utf8")
    .replace('<a:srgbClr val="222222" />', '<a:schemeClr val="accent1" />');
  assert.match(sampleSlideXml, /<a:schemeClr val="accent1"\s*\/>/);
  rewriteZipEntries(samplePptx, themedSamplePptx, { "ppt/slides/slide1.xml": Buffer.from(sampleSlideXml) });
  const mismatchedTargetPptx = path.join(tmp, "mismatched-target.pptx");
  const targetThemeXml = readZipEntry(targetPptx, "ppt/theme/theme1.xml").toString("utf8");
  const mismatchedThemeXml = targetThemeXml.replace(/<a:accent1>[\s\S]*?<\/a:accent1>/, '<a:accent1><a:srgbClr val="FF0000" /></a:accent1>');
  assert.notEqual(mismatchedThemeXml, targetThemeXml);
  rewriteZipEntries(targetPptx, mismatchedTargetPptx, { "ppt/theme/theme1.xml": Buffer.from(mismatchedThemeXml) });
  const themePlanFile = path.join(tmp, "theme-plan.json");
  fs.writeFileSync(themePlanFile, JSON.stringify({
    pptx: mismatchedTargetPptx,
    operations: [{ ...perfOperation, groupKey: "theme-mismatch", sample: { path: themedSamplePptx } }]
  }), "utf8");
  const themeOut = path.join(tmp, "theme-out.pptx");
  const themeRejected = invokeBuilder(["--apply-component-replacements-openxml", themePlanFile, "--out", themeOut]);
  assert.notEqual(themeRejected.status, 0);
  assert.match(themeRejected.stderr, /Theme-dependent colors.*matching source and target themes/);
  assert.equal(fs.existsSync(themeOut), false);
});

test("OpenXmlDeckBuilder imports native charts with bounded embedded workbooks", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-chart-"));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const samplePptx = path.join(tmp, "sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  const sample = createComponentDeckIr({});
  const chart = { id: "portable-chart", type: "column", box: { x: 10, y: 10, w: 300, h: 180 }, style: {}, categories: ["A", "B"], series: [{ name: "Value", values: [1, 2] }] };
  chart.nativePayload = promoteNativeChartPayload(chart);
  sample.pages[0].charts = [chart];
  fs.writeFileSync(sampleIr, JSON.stringify(sample), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", samplePptx]);
  const operation = { status: "ready", groupKey: "portable-chart", provider: "local", componentId: "portable-card", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: samplePptx } };
  fs.writeFileSync(planFile, JSON.stringify({
    pptx: targetPptx,
    operations: [operation]
  }), "utf8");

  const result = runBuilder(["--apply-component-replacements-openxml", planFile, "--out", outPptx]);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  const entries = listZipEntries(outPptx).map((entry) => entry.name);
  const chartEntry = entries.find((name) => /^ppt\/(?:slides\/)?charts\/chart\d+\.xml$/.test(name));
  const workbookEntry = entries.find((name) => /\/embeddings\//.test(name));
  const sampleEntries = listZipEntries(samplePptx).map((entry) => entry.name);
  const sampleChartEntry = sampleEntries.find((name) => /^ppt\/(?:slides\/)?charts\/chart\d+\.xml$/.test(name));
  const sampleWorkbookEntry = sampleEntries.find((name) => /\/embeddings\//.test(name));
  assert.equal(report.summary.applied, 1);
  assert.equal(report.operations[0].boundsIoU, 1);
  assert.ok(chartEntry);
  assert.ok(workbookEntry);
  assert.ok(sampleChartEntry);
  assert.ok(sampleWorkbookEntry);
  assert.equal(
    crypto.createHash("sha256").update(readZipEntry(outPptx, chartEntry)).digest("hex"),
    crypto.createHash("sha256").update(readZipEntry(samplePptx, sampleChartEntry)).digest("hex")
  );
  assert.equal(
    crypto.createHash("sha256").update(readZipEntry(outPptx, workbookEntry)).digest("hex"),
    crypto.createHash("sha256").update(readZipEntry(samplePptx, sampleWorkbookEntry)).digest("hex")
  );
  assert.match(readZipEntry(outPptx, chartEntry).toString("utf8"), /Value/);
  assert.ok(readZipEntries(readZipEntry(outPptx, workbookEntry)).some((entry) => entry.name === "xl/workbook.xml"));
  assert.match(readZipEntry(outPptx, "ppt/slides/_rels/slide1.xml.rels").toString("utf8"), /relationships\/chart/);
  assert.doesNotMatch(readZipEntry(outPptx, "ppt/slides/slide1.xml").toString("utf8"), /slideclone:componentReplacementPlan/);

  const chartRelsEntry = listZipEntries(samplePptx).map((entry) => entry.name).find((name) => /^ppt\/(?:slides\/)?charts\/_rels\/chart\d+\.xml\.rels$/.test(name));
  assert.ok(chartRelsEntry);
  const chartRels = readZipEntry(samplePptx, chartRelsEntry).toString("utf8");
  const externalChartRels = chartRels.replace(/Target="[^"]+"/, 'Target="https://example.invalid/data.xlsx" TargetMode="External"');
  assert.notEqual(externalChartRels, chartRels);
  const externalSample = path.join(tmp, "external-chart.pptx");
  rewriteZipEntries(samplePptx, externalSample, { [chartRelsEntry]: Buffer.from(externalChartRels) });
  const externalPlan = path.join(tmp, "external-plan.json");
  fs.writeFileSync(externalPlan, JSON.stringify({ pptx: targetPptx, operations: [{ ...operation, sample: { path: externalSample } }] }), "utf8");
  const externalOut = path.join(tmp, "external-out.pptx");
  const rejected = invokeBuilder(["--apply-component-replacements-openxml", externalPlan, "--out", externalOut]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /chart external.*not portable/i);
  assert.equal(fs.existsSync(externalOut), false);
});

test("OpenXmlDeckBuilder preserves bounded native chart style, color, and theme override parts", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-chart-style-"));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const plainSamplePptx = path.join(tmp, "plain-sample.pptx");
  const styledSamplePptx = path.join(tmp, "styled-sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  const sample = createComponentDeckIr({});
  const chart = { id: "styled-chart", type: "column", box: { x: 10, y: 10, w: 300, h: 180 }, style: {}, categories: ["A", "B"], series: [{ name: "Value", values: [2, 5] }] };
  chart.nativePayload = promoteNativeChartPayload(chart);
  sample.pages[0].charts = [chart];
  fs.writeFileSync(sampleIr, JSON.stringify(sample), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", plainSamplePptx]);
  const styleParts = addBoundedChartStyleParts(plainSamplePptx, styledSamplePptx);
  fs.writeFileSync(planFile, JSON.stringify({
    pptx: targetPptx,
    operations: [{ status: "ready", groupKey: "styled-chart", provider: "local", componentId: "styled-chart", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: styledSamplePptx } }]
  }), "utf8");

  const result = runBuilder(["--apply-component-replacements-openxml", planFile, "--out", outPptx]);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  const outputNames = listZipEntries(outPptx).map((entry) => entry.name);
  const outputStyle = outputNames.find((name) => /\/charts\/style\d*\.xml$/.test(name));
  const outputColor = outputNames.find((name) => /\/charts\/colors\d*\.xml$/.test(name));
  const outputThemeOverride = outputNames.find((name) => /\/charts\/theme\/themeOverride\d*\.xml$/i.test(name));
  assert.equal(report.summary.applied, 1);
  assert.ok(outputStyle);
  assert.ok(outputColor);
  assert.ok(outputThemeOverride);
  assert.deepEqual(readZipEntry(outPptx, outputStyle), styleParts.styleBytes);
  assert.deepEqual(readZipEntry(outPptx, outputColor), styleParts.colorBytes);
  assert.deepEqual(readZipEntry(outPptx, outputThemeOverride), styleParts.themeOverrideBytes);
  const outputChartRels = outputNames.find((name) => /\/charts\/_rels\/chart\d+\.xml\.rels$/.test(name));
  assert.match(readZipEntry(outPptx, outputChartRels).toString("utf8"), /relationships\/chartStyle/);
  assert.match(readZipEntry(outPptx, outputChartRels).toString("utf8"), /relationships\/chartColorStyle/);
  assert.match(readZipEntry(outPptx, outputChartRels).toString("utf8"), /relationships\/themeOverride/);

  const repeatedThemeSample = path.join(tmp, "repeated-theme-override.pptx");
  addDuplicateChartThemeOverridePart(styledSamplePptx, repeatedThemeSample);
  const repeatedThemePlan = path.join(tmp, "repeated-theme-override-plan.json");
  fs.writeFileSync(repeatedThemePlan, JSON.stringify({
    pptx: targetPptx,
    operations: [{ status: "ready", groupKey: "styled-chart", provider: "local", componentId: "styled-chart", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: repeatedThemeSample } }]
  }), "utf8");
  const repeatedThemeOut = path.join(tmp, "repeated-theme-override-out.pptx");
  const repeatedThemeResult = invokeBuilder(["--apply-component-replacements-openxml", repeatedThemePlan, "--out", repeatedThemeOut]);
  assert.notEqual(repeatedThemeResult.status, 0);
  assert.match(repeatedThemeResult.stderr, /at most one style, color style, theme override, and user-shapes drawing/i);
  assert.equal(fs.existsSync(repeatedThemeOut), false);

  const malformedSample = path.join(tmp, "malformed-style.pptx");
  rewriteZipEntries(styledSamplePptx, malformedSample, { [styleParts.styleEntry]: Buffer.from("<!DOCTYPE x><x/>") });
  const malformedPlan = path.join(tmp, "malformed-plan.json");
  fs.writeFileSync(malformedPlan, JSON.stringify({
    pptx: targetPptx,
    operations: [{ status: "ready", groupKey: "styled-chart", provider: "local", componentId: "styled-chart", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: malformedSample } }]
  }), "utf8");
  const malformedOut = path.join(tmp, "malformed-out.pptx");
  const rejected = invokeBuilder(["--apply-component-replacements-openxml", malformedPlan, "--out", malformedOut]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /style part contains malformed or unsafe XML/i);
  assert.equal(fs.existsSync(malformedOut), false);

  for (const [label, bytes, message] of [
    ["empty", Buffer.alloc(0), /style part is empty/i],
    ["oversized", Buffer.alloc(4 * 1024 * 1024 + 1, 0x20), /style part is empty or exceeds the 4 MiB/i],
    ["wrong-root", Buffer.from('<cs:notAStyle xmlns:cs="http://schemas.microsoft.com/office/drawing/2012/chartStyle"/>'), /unexpected XML root/i]
  ]) {
    const unsafeSample = path.join(tmp, `${label}-style.pptx`);
    rewriteZipEntries(styledSamplePptx, unsafeSample, { [styleParts.styleEntry]: bytes });
    const unsafePlan = path.join(tmp, `${label}-plan.json`);
    fs.writeFileSync(unsafePlan, JSON.stringify({
      pptx: targetPptx,
      operations: [{ status: "ready", groupKey: "styled-chart", provider: "local", componentId: "styled-chart", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: unsafeSample } }]
    }), "utf8");
    const unsafeOut = path.join(tmp, `${label}-out.pptx`);
    const unsafeResult = invokeBuilder(["--apply-component-replacements-openxml", unsafePlan, "--out", unsafeOut]);
    assert.notEqual(unsafeResult.status, 0);
    assert.match(unsafeResult.stderr, message);
    assert.equal(fs.existsSync(unsafeOut), false);
  }

  for (const [label, bytes, message] of [
    ["empty", Buffer.alloc(0), /theme override part is empty/i],
    ["oversized", Buffer.alloc(4 * 1024 * 1024 + 1, 0x20), /theme override part is empty or exceeds the 4 MiB/i],
    ["unsafe", Buffer.from("<!DOCTYPE x><x/>"), /theme override part contains malformed or unsafe XML/i],
    ["wrong-root", Buffer.from('<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>'), /theme override part has an unexpected XML root/i]
  ]) {
    const unsafeSample = path.join(tmp, `${label}-theme-override.pptx`);
    rewriteZipEntries(styledSamplePptx, unsafeSample, { [styleParts.themeOverrideEntry]: bytes });
    const unsafePlan = path.join(tmp, `${label}-theme-override-plan.json`);
    fs.writeFileSync(unsafePlan, JSON.stringify({
      pptx: targetPptx,
      operations: [{ status: "ready", groupKey: "styled-chart", provider: "local", componentId: "styled-chart", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: unsafeSample } }]
    }), "utf8");
    const unsafeOut = path.join(tmp, `${label}-theme-override-out.pptx`);
    const unsafeResult = invokeBuilder(["--apply-component-replacements-openxml", unsafePlan, "--out", unsafeOut]);
    assert.notEqual(unsafeResult.status, 0);
    assert.match(unsafeResult.stderr, message);
    assert.equal(fs.existsSync(unsafeOut), false);
  }
});

test("OpenXmlDeckBuilder preserves bounded chart user shapes and PNG relationships", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-chart-drawing-"));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const plainSamplePptx = path.join(tmp, "plain-sample.pptx");
  const annotatedSamplePptx = path.join(tmp, "annotated-sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  const sample = createComponentDeckIr({});
  const chart = { id: "annotated-chart", type: "column", box: { x: 10, y: 10, w: 300, h: 180 }, style: {}, categories: ["A", "B"], series: [{ name: "Value", values: [2, 5] }] };
  chart.nativePayload = promoteNativeChartPayload(chart);
  sample.pages[0].charts = [chart];
  fs.writeFileSync(sampleIr, JSON.stringify(sample), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", plainSamplePptx]);
  const drawingParts = addBoundedChartDrawingPart(plainSamplePptx, annotatedSamplePptx);
  const operation = { status: "ready", groupKey: "annotated-chart", provider: "local", componentId: "annotated-chart", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: annotatedSamplePptx } };
  fs.writeFileSync(planFile, JSON.stringify({ pptx: targetPptx, operations: [operation] }), "utf8");

  const result = runBuilder(["--apply-component-replacements-openxml", planFile, "--out", outPptx]);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  const outputNames = listZipEntries(outPptx).map((entry) => entry.name);
  const outputDrawing = outputNames.find((name) => /\/drawings\/drawing\d+\.xml$/i.test(name));
  const outputImage = outputNames.find((name) => /\/media\/image\d*\.png$/i.test(name));
  assert.equal(report.summary.applied, 1);
  assert.equal(report.operations[0].boundsIoU, 1);
  assert.ok(outputDrawing);
  assert.ok(outputImage);
  assert.deepEqual(readZipEntry(outPptx, outputDrawing), drawingParts.drawingBytes);
  assert.deepEqual(readZipEntry(outPptx, outputImage), drawingParts.imageBytes);
  const outputChartRels = outputNames.find((name) => /\/charts\/_rels\/chart\d+\.xml\.rels$/i.test(name));
  const outputDrawingRels = outputNames.find((name) => /\/drawings\/_rels\/drawing\d+\.xml\.rels$/i.test(name));
  assert.match(readZipEntry(outPptx, outputChartRels).toString("utf8"), /relationships\/chartUserShapes/);
  assert.match(readZipEntry(outPptx, outputDrawingRels).toString("utf8"), /relationships\/image/);

  const excessiveDimensions = Buffer.from(drawingParts.imageBytes);
  excessiveDimensions.writeUInt32BE(20_000, 16);
  for (const [label, entry, bytes, message] of [
    ["empty", drawingParts.drawingEntry, Buffer.alloc(0), /user-shapes XML is empty/i],
    ["oversized", drawingParts.drawingEntry, Buffer.alloc(8 * 1024 * 1024 + 1, 0x20), /exceeds the 8 MiB/i],
    ["unsafe", drawingParts.drawingEntry, Buffer.from("<!DOCTYPE x><x/>"), /user-shapes XML is malformed or unsafe/i],
    ["wrong-root", drawingParts.drawingEntry, Buffer.from('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>'), /unexpected root element/i],
    ["invalid-png", drawingParts.imageEntry, Buffer.alloc(24), /not a valid PNG payload/i],
    ["excessive-png", drawingParts.imageEntry, excessiveDimensions, /excessive pixel dimensions/i]
  ]) {
    const unsafeSample = path.join(tmp, `${label}.pptx`);
    rewriteZipEntries(annotatedSamplePptx, unsafeSample, { [entry]: bytes });
    const unsafePlan = path.join(tmp, `${label}-plan.json`);
    fs.writeFileSync(unsafePlan, JSON.stringify({ pptx: targetPptx, operations: [{ ...operation, sample: { path: unsafeSample } }] }), "utf8");
    const unsafeOut = path.join(tmp, `${label}-out.pptx`);
    const unsafeResult = invokeBuilder(["--apply-component-replacements-openxml", unsafePlan, "--out", unsafeOut]);
    assert.notEqual(unsafeResult.status, 0);
    assert.match(unsafeResult.stderr, message);
    assert.equal(fs.existsSync(unsafeOut), false);
  }

  const externalDrawingSample = path.join(tmp, "external-drawing-image.pptx");
  const drawingRels = readZipEntry(annotatedSamplePptx, drawingParts.drawingRelsEntry).toString("utf8");
  rewriteZipEntries(annotatedSamplePptx, externalDrawingSample, {
    [drawingParts.drawingRelsEntry]: Buffer.from(drawingRels.replace(/Target="[^"]+"/, 'Target="https://example.invalid/image.png" TargetMode="External"'))
  });
  const externalPlan = path.join(tmp, "external-drawing-plan.json");
  fs.writeFileSync(externalPlan, JSON.stringify({ pptx: targetPptx, operations: [{ ...operation, sample: { path: externalDrawingSample } }] }), "utf8");
  const externalOut = path.join(tmp, "external-drawing-out.pptx");
  const externalResult = invokeBuilder(["--apply-component-replacements-openxml", externalPlan, "--out", externalOut]);
  assert.notEqual(externalResult.status, 0);
  assert.match(externalResult.stderr, /user shapes cannot contain external/i);
  assert.equal(fs.existsSync(externalOut), false);
});

test("OpenXmlDeckBuilder preserves a bounded five-part editable SmartArt graph", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-smartart-"));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const plainSamplePptx = path.join(tmp, "plain-sample.pptx");
  const smartArtSamplePptx = path.join(tmp, "smartart-sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  const sample = createComponentDeckIr({});
  const chart = { id: "smartart-carrier", type: "column", box: { x: 10, y: 10, w: 300, h: 180 }, style: {}, categories: ["A"], series: [{ name: "Value", values: [2] }] };
  chart.nativePayload = promoteNativeChartPayload(chart);
  sample.pages[0].charts = [chart];
  fs.writeFileSync(sampleIr, JSON.stringify(sample), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", plainSamplePptx]);
  const parts = addBoundedSmartArtParts(plainSamplePptx, smartArtSamplePptx);
  const operation = { status: "ready", groupKey: "smartart-carrier", provider: "local", componentId: "smartart-carrier", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: smartArtSamplePptx } };
  fs.writeFileSync(planFile, JSON.stringify({ pptx: targetPptx, operations: [operation] }), "utf8");

  const result = runBuilder(["--apply-component-replacements-openxml", planFile, "--out", outPptx]);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  const outputNames = listZipEntries(outPptx).map((entry) => entry.name);
  assert.equal(report.summary.applied, 1);
  assert.equal(report.operations[0].boundsIoU, 1);
  for (const pattern of [/\/graphics\/data\d+\.xml$/i, /\/graphics\/layout\d+\.xml$/i, /\/graphics\/quickStyle\d+\.xml$/i, /\/graphics\/colors\d+\.xml$/i, /\/diagrams\/drawing(?:\d+)?\.xml$/i]) {
    assert.ok(outputNames.some((name) => pattern.test(name)), `missing copied SmartArt part matching ${pattern}`);
  }
  const slideXml = readZipEntry(outPptx, "ppt/slides/slide1.xml").toString("utf8");
  const slideRels = readZipEntry(outPptx, "ppt/slides/_rels/slide1.xml.rels").toString("utf8");
  assert.match(slideXml, /r:dm="rIdImportedSmartArtDM1"/);
  assert.match(slideXml, /r:lo="rIdImportedSmartArtLO1"/);
  assert.match(slideXml, /r:qs="rIdImportedSmartArtQS1"/);
  assert.match(slideXml, /r:cs="rIdImportedSmartArtCS1"/);
  assert.match(slideRels, /Id="rIdImportedSmartArtDR1"/);
  const copiedDataEntry = outputNames.find((name) => /\/graphics\/data\d+\.xml$/i.test(name));
  assert.match(readZipEntry(outPptx, copiedDataEntry).toString("utf8"), /relId="rIdImportedSmartArtDR1"/);

  for (const [label, entry, bytes, message] of [
    ["empty-data", parts.dataEntry, Buffer.alloc(0), /SmartArt data XML is empty/i],
    ["unsafe-data", parts.dataEntry, Buffer.from("<!DOCTYPE x><x/>"), /malformed or unsafe XML/i],
    ["wrong-layout-root", parts.layoutEntry, Buffer.from('<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>'), /layout definition has an unexpected XML root/i],
    ["oversized-colors", parts.colorsEntry, Buffer.alloc(8 * 1024 * 1024 + 1, 0x20), /colors XML is empty or exceeds the 8 MiB/i]
  ]) {
    const unsafeSample = path.join(tmp, `${label}.pptx`);
    rewriteZipEntries(smartArtSamplePptx, unsafeSample, { [entry]: bytes });
    const unsafePlan = path.join(tmp, `${label}-plan.json`);
    fs.writeFileSync(unsafePlan, JSON.stringify({ pptx: targetPptx, operations: [{ ...operation, sample: { path: unsafeSample } }] }), "utf8");
    const unsafeOut = path.join(tmp, `${label}-out.pptx`);
    const unsafeResult = invokeBuilder(["--apply-component-replacements-openxml", unsafePlan, "--out", unsafeOut]);
    assert.notEqual(unsafeResult.status, 0);
    assert.match(unsafeResult.stderr, message);
    assert.equal(fs.existsSync(unsafeOut), false);
  }

  const jpegBytes = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64");
  const jpegSample = path.join(tmp, "jpeg-smartart-sample.pptx");
  const jpegParts = addSharedSmartArtPng(smartArtSamplePptx, jpegSample, { extension: "jpg", contentType: "image/jpeg", imageBytes: jpegBytes });
  const jpegPlan = path.join(tmp, "jpeg-plan.json");
  fs.writeFileSync(jpegPlan, JSON.stringify({ pptx: targetPptx, operations: [{ ...operation, sample: { path: jpegSample } }] }), "utf8");
  const jpegOut = path.join(tmp, "jpeg-out.pptx");
  runBuilder(["--apply-component-replacements-openxml", jpegPlan, "--out", jpegOut]);
  assert.deepEqual(readZipEntry(jpegOut, listZipEntries(jpegOut).map((entry) => entry.name).find((name) => /\/media\/[^/]+\.jpe?g$/i.test(name))), jpegParts.imageBytes);

  const malformedJpegSample = path.join(tmp, "malformed-jpeg.pptx");
  rewriteZipEntries(jpegSample, malformedJpegSample, { [jpegParts.imageEntry]: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  const malformedJpegPlan = path.join(tmp, "malformed-jpeg-plan.json");
  fs.writeFileSync(malformedJpegPlan, JSON.stringify({ pptx: targetPptx, operations: [{ ...operation, sample: { path: malformedJpegSample } }] }), "utf8");
  const malformedJpegResult = invokeBuilder(["--apply-component-replacements-openxml", malformedJpegPlan, "--out", path.join(tmp, "malformed-jpeg-out.pptx")]);
  assert.notEqual(malformedJpegResult.status, 0);
  assert.match(malformedJpegResult.stderr, /JPEG has no valid dimensions/i);
});

test("OpenXmlDeckBuilder preserves bounded shared PNG images in editable SmartArt", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-picture-smartart-"));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const plainSamplePptx = path.join(tmp, "plain-sample.pptx");
  const smartArtSamplePptx = path.join(tmp, "smartart-sample.pptx");
  const pictureSamplePptx = path.join(tmp, "picture-smartart-sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  const sample = createComponentDeckIr({});
  const chart = { id: "picture-smartart", type: "column", box: { x: 10, y: 10, w: 300, h: 180 }, style: {}, categories: ["A"], series: [{ name: "Value", values: [2] }] };
  chart.nativePayload = promoteNativeChartPayload(chart);
  sample.pages[0].charts = [chart];
  fs.writeFileSync(sampleIr, JSON.stringify(sample), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", plainSamplePptx]);
  addBoundedSmartArtParts(plainSamplePptx, smartArtSamplePptx);
  const pictureParts = addSharedSmartArtPng(smartArtSamplePptx, pictureSamplePptx);
  const operation = { status: "ready", groupKey: "picture-smartart", provider: "local", componentId: "picture-smartart", layer: "0:0", slides: [1], target: { slide: 1, box: { x: 100, y: 100, w: 450, h: 270 } }, sample: { path: pictureSamplePptx } };
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(planFile, JSON.stringify({ pptx: targetPptx, operations: [operation] }), "utf8");

  const result = runBuilder(["--apply-component-replacements-openxml", planFile, "--out", outPptx]);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  const outputNames = listZipEntries(outPptx).map((entry) => entry.name);
  const mediaEntries = outputNames.filter((name) => /\/media\/[^/]+\.png$/i.test(name));
  assert.equal(report.summary.applied, 1);
  assert.equal(mediaEntries.length, 1);
  assert.deepEqual(readZipEntry(outPptx, mediaEntries[0]), pictureParts.imageBytes);
  const smartArtImageRels = outputNames.filter((name) => /\/(?:graphics|diagrams)\/_rels\/(?:data\d+|drawing(?:\d+)?)\.xml\.rels$/i.test(name));
  assert.equal(smartArtImageRels.length, 2);
  for (const rels of smartArtImageRels) assert.match(readZipEntry(outPptx, rels).toString("utf8"), /relationships\/image/);

  const excessiveDimensions = Buffer.from(pictureParts.imageBytes);
  excessiveDimensions.writeUInt32BE(20_000, 16);
  for (const [label, entry, bytes, message] of [
    ["invalid-png", pictureParts.imageEntry, Buffer.alloc(24), /not a valid PNG payload/i],
    ["excessive-png", pictureParts.imageEntry, excessiveDimensions, /excessive pixel dimensions/i],
    ["orphan-data-image", pictureParts.dataEntry, Buffer.from(pictureParts.dataBytes.toString("utf8").replace(' r:embed="rIdImage1"', "")), /unresolved or orphan image relationship/i]
  ]) {
    const unsafeSample = path.join(tmp, `${label}.pptx`);
    rewriteZipEntries(pictureSamplePptx, unsafeSample, { [entry]: bytes });
    const unsafePlan = path.join(tmp, `${label}-plan.json`);
    fs.writeFileSync(unsafePlan, JSON.stringify({ pptx: targetPptx, operations: [{ ...operation, sample: { path: unsafeSample } }] }), "utf8");
    const unsafeOut = path.join(tmp, `${label}-out.pptx`);
    const unsafeResult = invokeBuilder(["--apply-component-replacements-openxml", unsafePlan, "--out", unsafeOut]);
    assert.notEqual(unsafeResult.status, 0);
    assert.match(unsafeResult.stderr, message);
    assert.equal(fs.existsSync(unsafeOut), false);
  }
});

function addBoundedChartStyleParts(sourcePptx, outputPptx) {
  const source = fs.readFileSync(sourcePptx);
  const sourceEntries = readZipEntries(source, { maxEntryBytes: 128 * 1024 * 1024 });
  const names = sourceEntries.map((entry) => entry.name);
  const contentTypesEntry = "[Content_Types].xml";
  const chartRelsEntry = names.find((name) => /\/charts\/_rels\/chart\d+\.xml\.rels$/.test(name));
  assert.ok(chartRelsEntry);
  const chartDirectory = path.posix.dirname(path.posix.dirname(chartRelsEntry));
  const styleEntry = `${chartDirectory}/style1.xml`;
  const colorEntry = `${chartDirectory}/colors1.xml`;
  const themeOverrideEntry = `${chartDirectory}/themeOverride1.xml`;
  const styleEntryNames = [
    "axisTitle", "categoryAxis", "chartArea", "dataLabel", "dataPoint", "dataPoint3D", "dataPointLine",
    "dataPointMarker", "dataPointWireframe", "dataTable", "downBar", "dropLine", "errorBar", "floor",
    "gridlineMajor", "gridlineMinor", "hiLoLine", "leaderLine", "legend", "plotArea", "plotArea3D",
    "seriesAxis", "seriesLine", "title", "trendline", "trendlineLabel", "upBar", "valueAxis", "wall"
  ];
  const styleEntries = styleEntryNames.map((name) => `<cs:${name}><cs:lnRef idx="0"/><cs:fillRef idx="0"/><cs:effectRef idx="0"/><cs:fontRef idx="minor"><a:schemeClr val="tx1"/></cs:fontRef><cs:defRPr/></cs:${name}>`).join("");
  const styleBytes = Buffer.from(`<cs:chartStyle xmlns:cs="http://schemas.microsoft.com/office/drawing/2012/chartStyle" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" id="201">${styleEntries}</cs:chartStyle>`);
  const colorBytes = Buffer.from(`<cs:colorStyle xmlns:cs="http://schemas.microsoft.com/office/drawing/2012/chartStyle" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" meth="cycle" id="10">
    <a:schemeClr val="accent1"/><a:schemeClr val="accent2"/><a:schemeClr val="accent3"/><a:schemeClr val="accent4"/><a:schemeClr val="accent5"/><a:schemeClr val="accent6"/>
    <cs:variation/><cs:variation><a:lumMod val="60000"/></cs:variation><cs:variation><a:lumMod val="80000"/><a:lumOff val="20000"/></cs:variation>
    <cs:variation><a:lumMod val="80000"/></cs:variation><cs:variation><a:lumMod val="60000"/><a:lumOff val="40000"/></cs:variation><cs:variation><a:lumMod val="50000"/></cs:variation>
    <cs:variation><a:lumMod val="70000"/><a:lumOff val="30000"/></cs:variation><cs:variation><a:lumMod val="70000"/></cs:variation><cs:variation><a:lumMod val="50000"/><a:lumOff val="50000"/></cs:variation>
  </cs:colorStyle>`);
  const themeOverrideBytes = Buffer.from(`<a:themeOverride xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:clrScheme name="Chart Override"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2><a:accent1><a:srgbClr val="E4572E"/></a:accent1><a:accent2><a:srgbClr val="17BEBB"/></a:accent2><a:accent3><a:srgbClr val="FFC914"/></a:accent3><a:accent4><a:srgbClr val="2E282A"/></a:accent4><a:accent5><a:srgbClr val="76B041"/></a:accent5><a:accent6><a:srgbClr val="5C80BC"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme></a:themeOverride>`);
  const contentTypes = readZipBufferEntry(source, contentTypesEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8")
    .replace(/<\/Types>\s*$/, `<Override PartName="/${styleEntry}" ContentType="application/vnd.ms-office.chartstyle+xml"/><Override PartName="/${colorEntry}" ContentType="application/vnd.ms-office.chartcolorstyle+xml"/><Override PartName="/${themeOverrideEntry}" ContentType="application/vnd.openxmlformats-officedocument.themeOverride+xml"/></Types>`);
  const chartRels = readZipBufferEntry(source, chartRelsEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8")
    .replace(/<\/Relationships>\s*$/, '<Relationship Id="rIdChartStyle" Type="http://schemas.microsoft.com/office/2011/relationships/chartStyle" Target="style1.xml"/><Relationship Id="rIdChartColorStyle" Type="http://schemas.microsoft.com/office/2011/relationships/chartColorStyle" Target="colors1.xml"/><Relationship Id="rIdThemeOverride" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/themeOverride" Target="themeOverride1.xml"/></Relationships>');
  const outputEntries = sourceEntries.map((entry) => ({
    name: entry.name,
    data: entry.name === contentTypesEntry
      ? Buffer.from(contentTypes)
      : entry.name === chartRelsEntry
        ? Buffer.from(chartRels)
        : readZipBufferEntry(source, entry.name, { maxEntryBytes: 128 * 1024 * 1024 })
  }));
  outputEntries.push({ name: styleEntry, data: styleBytes }, { name: colorEntry, data: colorBytes }, { name: themeOverrideEntry, data: themeOverrideBytes });
  writeStoredZipAtomic(outputPptx, outputEntries);
  return { styleEntry, colorEntry, themeOverrideEntry, styleBytes, colorBytes, themeOverrideBytes };
}

function addDuplicateChartThemeOverridePart(sourcePptx, outputPptx) {
  const source = fs.readFileSync(sourcePptx);
  const sourceEntries = readZipEntries(source, { maxEntryBytes: 128 * 1024 * 1024 });
  const names = sourceEntries.map((entry) => entry.name);
  const contentTypesEntry = "[Content_Types].xml";
  const chartRelsEntry = names.find((name) => /\/charts\/_rels\/chart\d+\.xml\.rels$/.test(name));
  const firstThemeEntry = names.find((name) => /\/charts\/themeOverride1\.xml$/i.test(name));
  assert.ok(chartRelsEntry);
  assert.ok(firstThemeEntry);
  const secondThemeEntry = firstThemeEntry.replace(/1\.xml$/i, "2.xml");
  const contentTypes = readZipBufferEntry(source, contentTypesEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8")
    .replace(/<\/Types>\s*$/, `<Override PartName="/${secondThemeEntry}" ContentType="application/vnd.openxmlformats-officedocument.themeOverride+xml"/></Types>`);
  const chartRels = readZipBufferEntry(source, chartRelsEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8")
    .replace(/<\/Relationships>\s*$/, '<Relationship Id="rIdThemeOverride2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/themeOverride" Target="themeOverride2.xml"/></Relationships>');
  const outputEntries = sourceEntries.map((entry) => ({
    name: entry.name,
    data: entry.name === contentTypesEntry
      ? Buffer.from(contentTypes)
      : entry.name === chartRelsEntry
        ? Buffer.from(chartRels)
        : readZipBufferEntry(source, entry.name, { maxEntryBytes: 128 * 1024 * 1024 })
  }));
  outputEntries.push({ name: secondThemeEntry, data: readZipBufferEntry(source, firstThemeEntry, { maxEntryBytes: 4 * 1024 * 1024 }) });
  writeStoredZipAtomic(outputPptx, outputEntries);
}

function addBoundedChartDrawingPart(sourcePptx, outputPptx) {
  const source = fs.readFileSync(sourcePptx);
  const sourceEntries = readZipEntries(source, { maxEntryBytes: 128 * 1024 * 1024 });
  const names = sourceEntries.map((entry) => entry.name);
  const contentTypesEntry = "[Content_Types].xml";
  const chartEntry = names.find((name) => /\/charts\/chart\d+\.xml$/i.test(name));
  const chartRelsEntry = names.find((name) => /\/charts\/_rels\/chart\d+\.xml\.rels$/i.test(name));
  assert.ok(chartEntry);
  assert.ok(chartRelsEntry);
  const chartRoot = path.posix.dirname(path.posix.dirname(chartEntry));
  const drawingEntry = `${chartRoot}/drawings/drawing1.xml`;
  const drawingRelsEntry = `${chartRoot}/drawings/_rels/drawing1.xml.rels`;
  const imageEntry = `${chartRoot}/media/chart-user-shape.png`;
  const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const drawingBytes = Buffer.from(`<c:userShapes xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:cdr="http://schemas.openxmlformats.org/drawingml/2006/chartDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><cdr:relSizeAnchor><cdr:from><cdr:x>0.08</cdr:x><cdr:y>0.08</cdr:y></cdr:from><cdr:to><cdr:x>0.42</cdr:x><cdr:y>0.28</cdr:y></cdr:to><cdr:sp macro="" textlink=""><cdr:nvSpPr><cdr:cNvPr id="2" name="Chart annotation"/><cdr:cNvSpPr/></cdr:nvSpPr><cdr:spPr><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFC914"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E4572E"/></a:solidFill></a:ln></cdr:spPr><cdr:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200"><a:latin typeface="Arial"/></a:rPr><a:t>Editable note</a:t></a:r><a:endParaRPr lang="en-US"><a:latin typeface="Arial"/></a:endParaRPr></a:p></cdr:txBody></cdr:sp></cdr:relSizeAnchor><cdr:relSizeAnchor><cdr:from><cdr:x>0.82</cdr:x><cdr:y>0.08</cdr:y></cdr:from><cdr:to><cdr:x>0.92</cdr:x><cdr:y>0.18</cdr:y></cdr:to><cdr:pic><cdr:nvPicPr><cdr:cNvPr id="3" name="Chart PNG"/><cdr:cNvPicPr/></cdr:nvPicPr><cdr:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></cdr:blipFill><cdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></cdr:spPr></cdr:pic></cdr:relSizeAnchor></c:userShapes>`);
  let contentTypes = readZipBufferEntry(source, contentTypesEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8")
    .replace(/<\/Types>\s*$/, `<Override PartName="/${drawingEntry}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml"/></Types>`);
  if (!/<Default Extension="png"/i.test(contentTypes)) {
    contentTypes = contentTypes.replace(/<\/Types>\s*$/, '<Default Extension="png" ContentType="image/png"/></Types>');
  }
  const chartXml = readZipBufferEntry(source, chartEntry, { maxEntryBytes: 16 * 1024 * 1024 }).toString("utf8")
    .replace(/<\/c:chartSpace>\s*$/, '<c:userShapes r:id="rIdUserShapes"/></c:chartSpace>');
  const chartRels = readZipBufferEntry(source, chartRelsEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8")
    .replace(/<\/Relationships>\s*$/, '<Relationship Id="rIdUserShapes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartUserShapes" Target="../drawings/drawing1.xml"/></Relationships>');
  const drawingRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/chart-user-shape.png"/></Relationships>';
  const outputEntries = sourceEntries.map((entry) => ({
    name: entry.name,
    data: entry.name === contentTypesEntry
      ? Buffer.from(contentTypes)
      : entry.name === chartEntry
        ? Buffer.from(chartXml)
        : entry.name === chartRelsEntry
          ? Buffer.from(chartRels)
          : readZipBufferEntry(source, entry.name, { maxEntryBytes: 128 * 1024 * 1024 })
  }));
  outputEntries.push(
    { name: drawingEntry, data: drawingBytes },
    { name: drawingRelsEntry, data: Buffer.from(drawingRels) },
    { name: imageEntry, data: imageBytes }
  );
  writeStoredZipAtomic(outputPptx, outputEntries);
  return { drawingEntry, drawingRelsEntry, imageEntry, drawingBytes, imageBytes };
}

function addBoundedSmartArtParts(sourcePptx, outputPptx) {
  const source = fs.readFileSync(sourcePptx);
  const sourceEntries = readZipEntries(source, { maxEntryBytes: 128 * 1024 * 1024 });
  const names = sourceEntries.map((entry) => entry.name);
  const contentTypesEntry = "[Content_Types].xml";
  const slideEntry = names.find((name) => /\/slides\/slide1\.xml$/i.test(name));
  const slideRelsEntry = names.find((name) => /\/slides\/_rels\/slide1\.xml\.rels$/i.test(name));
  assert.ok(slideEntry);
  assert.ok(slideRelsEntry);
  const dataEntry = "ppt/diagrams/data1.xml";
  const layoutEntry = "ppt/diagrams/layout1.xml";
  const styleEntry = "ppt/diagrams/quickStyle1.xml";
  const colorsEntry = "ppt/diagrams/colors1.xml";
  const drawingEntry = "ppt/diagrams/drawing1.xml";
  const dgm = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
  const drawingNs = "http://schemas.microsoft.com/office/drawing/2008/diagram";
  const dataBytes = Buffer.from(`<dgm:dataModel xmlns:dgm="${dgm}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="0" type="doc"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p/></dgm:t></dgm:pt></dgm:ptLst><dgm:cxnLst/><dgm:bg/><dgm:whole/><dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="${drawingNs}" relId="rIdSmartArtDrawing" minVer="${dgm}"/></a:ext></dgm:extLst></dgm:dataModel>`);
  const model = '<dgm:dataModel><dgm:ptLst><dgm:pt modelId="0" type="doc"/></dgm:ptLst><dgm:cxnLst/><dgm:bg/><dgm:whole/></dgm:dataModel>';
  const layoutBytes = Buffer.from(`<dgm:layoutDef xmlns:dgm="${dgm}" uniqueId="urn:codex:bounded-list"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="list" pri="1"/></dgm:catLst><dgm:sampData>${model}</dgm:sampData><dgm:styleData>${model}</dgm:styleData><dgm:clrData>${model}</dgm:clrData><dgm:layoutNode name="root"/></dgm:layoutDef>`);
  const styleBytes = Buffer.from(`<dgm:styleDef xmlns:dgm="${dgm}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uniqueId="urn:codex:bounded-style"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="simple" pri="1"/></dgm:catLst><dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d><dgm:styleLbl name="node0"><dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d><dgm:sp3d/><dgm:txPr/><dgm:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></dgm:style></dgm:styleLbl></dgm:styleDef>`);
  const colorsBytes = Buffer.from(`<dgm:colorsDef xmlns:dgm="${dgm}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uniqueId="urn:codex:bounded-colors"><dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="accent1" pri="1"/></dgm:catLst><dgm:styleLbl name="node0"><dgm:fillClrLst meth="repeat"><a:schemeClr val="accent1"/></dgm:fillClrLst><dgm:linClrLst meth="repeat"><a:schemeClr val="lt1"/></dgm:linClrLst><dgm:effectClrLst/><dgm:txLinClrLst/><dgm:txFillClrLst/><dgm:txEffectClrLst/></dgm:styleLbl></dgm:colorsDef>`);
  const drawingBytes = Buffer.from(`<dsp:drawing xmlns:dsp="${drawingNs}"><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/></dsp:spTree></dsp:drawing>`);
  const contentTypes = readZipBufferEntry(source, contentTypesEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8")
    .replace(/<Override PartName="\/ppt\/charts\/chart1\.xml"[^>]*\/>/, "")
    .replace(/<Override PartName="\/ppt\/embeddings\/embeddedWorkbook1\.xlsx"[^>]*\/>/, "")
    .replace(/<\/Types>\s*$/, `<Override PartName="/${dataEntry}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"/><Override PartName="/${layoutEntry}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml"/><Override PartName="/${styleEntry}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml"/><Override PartName="/${colorsEntry}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml"/><Override PartName="/${drawingEntry}" ContentType="application/vnd.ms-office.drawingml.diagramDrawing+xml"/></Types>`);
  const slideXml = readZipBufferEntry(source, slideEntry, { maxEntryBytes: 16 * 1024 * 1024 }).toString("utf8")
    .replace(/<a:graphicData uri="http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/chart">[\s\S]*?<\/a:graphicData>/, `<a:graphicData uri="${dgm}"><dgm:relIds xmlns:dgm="${dgm}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:dm="rIdSmartArtData" r:lo="rIdSmartArtLayout" r:qs="rIdSmartArtStyle" r:cs="rIdSmartArtColors"/></a:graphicData>`);
  const slideRels = readZipBufferEntry(source, slideRelsEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8")
    .replace(/<Relationship[^>]+relationships\/chart[^>]+\/>/, `<Relationship Id="rIdSmartArtData" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/><Relationship Id="rIdSmartArtLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout" Target="../diagrams/layout1.xml"/><Relationship Id="rIdSmartArtStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle" Target="../diagrams/quickStyle1.xml"/><Relationship Id="rIdSmartArtColors" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors" Target="../diagrams/colors1.xml"/><Relationship Id="rIdSmartArtDrawing" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="../diagrams/drawing1.xml"/>`);
  const outputEntries = sourceEntries
    .filter((entry) => !/\/charts\/|\/embeddings\//i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      data: entry.name === contentTypesEntry ? Buffer.from(contentTypes)
        : entry.name === slideEntry ? Buffer.from(slideXml)
          : entry.name === slideRelsEntry ? Buffer.from(slideRels)
            : readZipBufferEntry(source, entry.name, { maxEntryBytes: 128 * 1024 * 1024 })
    }));
  outputEntries.push({ name: dataEntry, data: dataBytes }, { name: layoutEntry, data: layoutBytes }, { name: styleEntry, data: styleBytes }, { name: colorsEntry, data: colorsBytes }, { name: drawingEntry, data: drawingBytes });
  writeStoredZipAtomic(outputPptx, outputEntries);
  return { dataEntry, layoutEntry, styleEntry, colorsEntry, drawingEntry };
}

function addSharedSmartArtPng(sourcePptx, outputPptx, options = {}) {
  const source = fs.readFileSync(sourcePptx);
  const sourceEntries = readZipEntries(source, { maxEntryBytes: 128 * 1024 * 1024 });
  const contentTypesEntry = "[Content_Types].xml";
  const dataEntry = "ppt/diagrams/data1.xml";
  const drawingEntry = "ppt/diagrams/drawing1.xml";
  const dataRelsEntry = "ppt/diagrams/_rels/data1.xml.rels";
  const drawingRelsEntry = "ppt/diagrams/_rels/drawing1.xml.rels";
  const extension = options.extension || "png";
  const contentType = options.contentType || "image/png";
  const imageEntry = `ppt/media/smartart-shared.${extension}`;
  const imageBytes = options.imageBytes || Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const dataBytes = Buffer.from(readZipBufferEntry(source, dataEntry, { maxEntryBytes: 16 * 1024 * 1024 }).toString("utf8")
    .replace("<dgm:spPr/>", '<dgm:spPr><a:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></dgm:spPr>'));
  const drawingBytes = Buffer.from(readZipBufferEntry(source, drawingEntry, { maxEntryBytes: 16 * 1024 * 1024 }).toString("utf8")
    .replace("<dsp:grpSpPr/>", '<dsp:grpSpPr/><dsp:sp modelId="0"><dsp:nvSpPr><dsp:cNvPr id="1" name="Shared image"/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr><a:xfrm xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/></a:xfrm><a:prstGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" prst="rect"><a:avLst/></a:prstGeom><a:blipFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></dsp:spPr></dsp:sp>'));
  let contentTypes = readZipBufferEntry(source, contentTypesEntry, { maxEntryBytes: 4 * 1024 * 1024 }).toString("utf8");
  if (!new RegExp(`<Default Extension="${extension}"`, "i").test(contentTypes)) contentTypes = contentTypes.replace(/<\/Types>\s*$/, `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
  const imageRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/smartart-shared.${extension}"/></Relationships>`;
  const outputEntries = sourceEntries.map((entry) => ({
    name: entry.name,
    data: entry.name === contentTypesEntry ? Buffer.from(contentTypes)
      : entry.name === dataEntry ? dataBytes
        : entry.name === drawingEntry ? drawingBytes
          : readZipBufferEntry(source, entry.name, { maxEntryBytes: 128 * 1024 * 1024 })
  }));
  outputEntries.push({ name: dataRelsEntry, data: Buffer.from(imageRelationships) }, { name: drawingRelsEntry, data: Buffer.from(imageRelationships) }, { name: imageEntry, data: imageBytes });
  writeStoredZipAtomic(outputPptx, outputEntries);
  return { dataEntry, drawingEntry, imageEntry, dataRelsEntry, drawingRelsEntry, dataBytes, drawingBytes, imageBytes };
}

function resolveDotnet() {
  if (process.env.DOTNET_BIN) return process.env.DOTNET_BIN;
  const local = path.join(__dirname, "..", ".tools", "dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
  return fs.existsSync(local) ? local : "dotnet";
}

function runBuilder(args) {
  const result = invokeBuilder(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function invokeBuilder(args) {
  const invocationArgs = freshBuilderDll()
    ? [builderDll, ...args]
    : ["run", "--project", projectFile, "--", ...args];
  return spawnSync(resolveDotnet(), invocationArgs, {
    cwd: path.dirname(projectFile),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
}

function freshBuilderDll() {
  if (!fs.existsSync(builderDll)) return false;
  const dllMtime = fs.statSync(builderDll).mtimeMs;
  const sourceFiles = fs.readdirSync(path.dirname(projectFile))
    .filter((name) => name.endsWith(".cs") || name.endsWith(".csproj"))
    .map((name) => path.join(path.dirname(projectFile), name));
  return sourceFiles.every((file) => fs.statSync(file).mtimeMs <= dllMtime);
}

function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

function assertNear(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function createMinimalDeckIr(text) {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [],
      textBoxes: [{
        id: "title",
        text,
        box: { x: 100, y: 100, w: 400, h: 60 },
        font: { family: "Arial", sizePt: 24, weight: "bold", color: "#111111", align: "left", valign: "top", lineHeightMultiple: 1 },
        style: {}
      }],
      images: [],
      tables: [],
      charts: []
    }]
  };
}

function createComponentDeckIr({ anchor = false, sample = false } = {}) {
  const replacementPlan = {
    sourceProvider: "local",
    componentKind: "component",
    componentId: "portable-card",
    layerKey: "0:0",
    suitabilityTier: "strong",
    suitabilityScore: 99
  };
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: {},
      shapes: anchor ? [{
        id: "portable-anchor",
        type: "rect",
        box: { x: 120, y: 100, w: 360, h: 220 },
        style: { fill: "#E8EEF7" },
        source: { componentReplacementPlan: replacementPlan }
      }] : sample ? [{
        id: "portable-sample-shape",
        type: "roundrect",
        box: { x: 20, y: 20, w: 300, h: 160 },
        style: { fill: "#2F80ED", lineColor: "#165BAA" },
        source: {}
      }] : [],
      textBoxes: sample ? [{
        id: "portable-sample-text",
        text: "Portable editable text",
        box: { x: 60, y: 70, w: 220, h: 40 },
        font: { family: "Arial", sizePt: 20, weight: "bold", color: "#FFFFFF", align: "center", valign: "mid", lineHeightMultiple: 1 },
        style: {}
      }] : [],
      images: [],
      tables: [],
      charts: []
    }]
  };
}

function createComponentReplacementFixture(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const targetIr = path.join(tmp, "target.json");
  const sampleIr = path.join(tmp, "sample.json");
  const targetPptx = path.join(tmp, "target.pptx");
  const samplePptx = path.join(tmp, "sample.pptx");
  const outPptx = path.join(tmp, "out.pptx");
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(targetIr, JSON.stringify(createComponentDeckIr({ anchor: true })), "utf8");
  fs.writeFileSync(sampleIr, JSON.stringify(createComponentDeckIr({ sample: true })), "utf8");
  runBuilder(["--ir", targetIr, "--out", targetPptx]);
  runBuilder(["--ir", sampleIr, "--out", samplePptx]);
  fs.writeFileSync(planFile, JSON.stringify({
    pptx: targetPptx,
    operations: [{
      operation: "replace-anchor-group-with-component-sample",
      status: "ready",
      groupKey: "local:component:portable-card:0:0",
      provider: "local",
      componentId: "portable-card",
      layer: "0:0",
      slides: [1],
      target: { slide: 1, box: { x: 120, y: 100, w: 360, h: 220 } },
      sample: { provider: "local", path: samplePptx }
    }]
  }), "utf8");
  return { tmp, targetPptx, samplePptx, outPptx, planFile };
}

function addSlideShapeTiming(sourcePptx, outputPptx, drawingName) {
  const source = fs.readFileSync(sourcePptx);
  const slideEntry = readZipEntries(source, { maxEntryBytes: 128 * 1024 * 1024 })
    .map((entry) => entry.name)
    .find((name) => /ppt\/slides\/slide1\.xml$/i.test(name));
  assert.ok(slideEntry);
  const slideXml = readZipBufferEntry(source, slideEntry, { maxEntryBytes: 16 * 1024 * 1024 }).toString("utf8");
  const escapedName = drawingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shapeId = new RegExp(`<p:cNvPr[^>]*id="(\\d+)"[^>]*name="${escapedName}"`).exec(slideXml)?.[1]
    || new RegExp(`<p:cNvPr[^>]*name="${escapedName}"[^>]*id="(\\d+)"`).exec(slideXml)?.[1];
  assert.ok(shapeId, `missing shape id for ${drawingName}`);
  const timing = `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:childTnLst><p:set><p:cBhvr><p:cTn id="4" dur="1" fill="hold"/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
  const animated = /<p:extLst>/.test(slideXml)
    ? slideXml.replace(/<p:extLst>/, `${timing}<p:extLst>`)
    : slideXml.replace(/<\/p:sld>$/, `${timing}</p:sld>`);
  assert.notEqual(animated, slideXml);
  rewriteZipEntries(sourcePptx, outputPptx, { [slideEntry]: Buffer.from(animated) });
}
