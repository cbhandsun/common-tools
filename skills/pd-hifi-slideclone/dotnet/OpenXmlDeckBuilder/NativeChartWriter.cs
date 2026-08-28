using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Xml;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;
using X = DocumentFormat.OpenXml.Spreadsheet;

internal static class NativeChartWriter
{
    public static bool TryCreate(ChartIr chart, SlidePart slidePart, uint shapeId, P.NonVisualDrawingProperties drawingProperties, out P.GraphicFrame graphicFrame, P.ApplicationNonVisualDrawingProperties? applicationProperties = null)
    {
        graphicFrame = null!;
        if (chart.NativePayload is null || chart.NativePayload.Value.ValueKind != JsonValueKind.Object) return false;
        var payload = chart.NativePayload.Value;
        ValidateInput(chart, payload);
        var chartType = NormalizeType(chart.Type);
        if (chartType is not ("bar" or "column" or "line" or "pie" or "donut"))
            throw new InvalidOperationException($"Chart {chart.Id} type is not supported by the native ChartPart builder.");
        var series = Series(chart);
        if (series.Count == 0 || series.Count > 64 || series.Any(item => item.Values.Count == 0 || item.Values.Count > 10000 || item.Values.Any(value => !double.IsFinite(value))))
            throw new InvalidOperationException($"Chart {chart.Id} contains invalid or unbounded native series data.");
        var workbook = GetObject(payload, "workbook");
        var sheetName = GetString(workbook, "sheetName") ?? "Data";
        if (!IsSafeWorksheetName(sheetName)) throw new InvalidOperationException($"Chart {chart.Id} has an invalid worksheet name.");
        var categories = Categories(chart, series.Max(item => item.Values.Count));

        var chartPart = slidePart.AddNewPart<ChartPart>($"rIdChart{shapeId}");
        var embeddedPart = chartPart.AddEmbeddedPackagePart("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "rIdWorkbook1");
        WriteWorkbook(embeddedPart, sheetName, categories, series);
        WriteChartXml(chartPart, chart, chartType, sheetName, categories, series, chartPart.GetIdOfPart(embeddedPart), shapeId);
        graphicFrame = new P.GraphicFrame(
            new P.NonVisualGraphicFrameProperties(drawingProperties, new P.NonVisualGraphicFrameDrawingProperties(), applicationProperties ?? new P.ApplicationNonVisualDrawingProperties()),
            new P.Transform(new A.Offset { X = ToEmu(chart.Box.X), Y = ToEmu(chart.Box.Y) }, new A.Extents { Cx = ToEmu(chart.Box.W), Cy = ToEmu(chart.Box.H) }),
            new A.Graphic(new A.GraphicData(new DocumentFormat.OpenXml.Drawing.Charts.ChartReference { Id = slidePart.GetIdOfPart(chartPart) })
            { Uri = "http://schemas.openxmlformats.org/drawingml/2006/chart" })
        );
        return true;
    }

    private static void ValidateInput(ChartIr chart, JsonElement payload)
    {
        if ((chart.Categories?.Count ?? 0) > 10000 || (chart.Series?.Count ?? 0) > 64 || (chart.Values?.Count ?? 0) > 10000)
            throw new InvalidOperationException($"Chart {chart.Id} exceeds native data limits.");
        if ((chart.Categories ?? []).Any(value => value is null || value.Length > 4096) || (chart.Series ?? []).Any(value => value.Name?.Length > 4096))
            throw new InvalidOperationException($"Chart {chart.Id} contains invalid or oversized labels.");
        var signature = GetString(payload, "fallbackSignature") ?? throw new InvalidOperationException($"Chart {chart.Id} nativePayload.fallbackSignature is required.");
        var expectedHash = GetString(payload, "fallbackSha256") ?? throw new InvalidOperationException($"Chart {chart.Id} nativePayload.fallbackSha256 is required.");
        if (!string.Equals(GetString(payload, "schemaVersion"), "1.0", StringComparison.Ordinal) || GetBoolean(payload, "dataVerified") != true)
            throw new InvalidOperationException($"Chart {chart.Id} nativePayload must be schema 1.0 with dataVerified=true.");
        var actualHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(signature))).ToLowerInvariant();
        if (!string.Equals(actualHash, expectedHash, StringComparison.Ordinal) || !string.Equals(signature, BuildFallbackSignature(chart), StringComparison.Ordinal))
            throw new InvalidOperationException($"Chart {chart.Id} nativePayload is stale or its fallback hash is invalid.");
    }

    private static string BuildFallbackSignature(ChartIr chart)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
        {
            var series = Series(chart);
            var categories = Categories(chart, series.Count == 0 ? 0 : series.Max(item => item.Values.Count));
            writer.WriteStartObject();
            writer.WritePropertyName("categories"); writer.WriteStartArray();
            foreach (var category in categories) writer.WriteStringValue(category);
            writer.WriteEndArray();
            writer.WriteString("schemaVersion", "1.0");
            writer.WritePropertyName("series"); writer.WriteStartArray();
            foreach (var item in series)
            {
                writer.WriteStartObject(); writer.WriteString("name", item.Name); writer.WritePropertyName("values"); writer.WriteStartArray();
                foreach (var value in item.Values) writer.WriteNumberValue(value == 0 ? 0 : value);
                writer.WriteEndArray(); writer.WriteEndObject();
            }
            writer.WriteEndArray();
            writer.WritePropertyName("style");
            WriteCanonicalJson(writer, chart.Style is { ValueKind: JsonValueKind.Object } ? chart.Style.Value : JsonSerializer.SerializeToElement(new { }));
            writer.WriteString("type", NormalizeType(chart.Type)); writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static void WriteCanonicalJson(Utf8JsonWriter writer, JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in value.EnumerateObject().OrderBy(property => property.Name, StringComparer.Ordinal))
                {
                    if (property.Name is "__proto__" or "prototype" or "constructor") throw new InvalidOperationException("Chart style contains a forbidden key.");
                    writer.WritePropertyName(property.Name); WriteCanonicalJson(writer, property.Value);
                }
                writer.WriteEndObject(); break;
            case JsonValueKind.Array:
                writer.WriteStartArray(); foreach (var item in value.EnumerateArray()) WriteCanonicalJson(writer, item); writer.WriteEndArray(); break;
            case JsonValueKind.String: writer.WriteStringValue(value.GetString()); break;
            case JsonValueKind.Number:
                if (!value.TryGetDouble(out var number) || !double.IsFinite(number)) throw new InvalidOperationException("Chart style contains a non-finite number.");
                writer.WriteNumberValue(number == 0 ? 0 : number); break;
            case JsonValueKind.True: writer.WriteBooleanValue(true); break;
            case JsonValueKind.False: writer.WriteBooleanValue(false); break;
            case JsonValueKind.Null: writer.WriteNullValue(); break;
            default: throw new InvalidOperationException("Chart style contains an unsupported JSON value.");
        }
    }

    private static List<NativeChartSeriesData> Series(ChartIr chart) => chart.Series is { Count: > 0 }
        ? chart.Series.Take(64).Select((series, index) => new NativeChartSeriesData(string.IsNullOrEmpty(series.Name) ? $"Series {index + 1}" : series.Name[..Math.Min(series.Name.Length, 4096)], series.Values ?? [])).ToList()
        : chart.Values is { Count: > 0 } ? [new NativeChartSeriesData("Series 1", chart.Values)] : [];

    private static List<string> Categories(ChartIr chart, int count) => Enumerable.Range(0, count)
        .Select(index => chart.Categories is { Count: > 0 } && index < chart.Categories.Count && !string.IsNullOrEmpty(chart.Categories[index])
            ? chart.Categories[index][..Math.Min(chart.Categories[index].Length, 4096)] : (index + 1).ToString(CultureInfo.InvariantCulture)).ToList();

    private static string NormalizeType(string? value)
    {
        var type = (value ?? "bar").Trim().ToLowerInvariant();
        return type == "doughnut" ? "donut" : type;
    }

    private static bool IsSafeWorksheetName(string value) => value.Length is > 0 and <= 31
        && value.All(character => char.IsLetterOrDigit(character) || character is ' ' or '_' or '.' or '-') && value[0] != '\'' && value[^1] != '\'';

    private static void WriteWorkbook(EmbeddedPackagePart embeddedPart, string sheetName, IReadOnlyList<string> categories, IReadOnlyList<NativeChartSeriesData> series)
    {
        using var spreadsheet = SpreadsheetDocument.Create(embeddedPart.GetStream(FileMode.Create, FileAccess.ReadWrite), SpreadsheetDocumentType.Workbook);
        var workbookPart = spreadsheet.AddWorkbookPart(); workbookPart.Workbook = new X.Workbook();
        var worksheetPart = workbookPart.AddNewPart<WorksheetPart>(); var sheetData = new X.SheetData(); worksheetPart.Worksheet = new X.Worksheet(sheetData);
        var header = new X.Row { RowIndex = 1U }; header.Append(InlineStringCell("A1", "Category"));
        for (var index = 0; index < series.Count; index++) header.Append(InlineStringCell($"{SpreadsheetColumn(index + 2)}1", series[index].Name));
        sheetData.Append(header);
        for (var rowIndex = 0; rowIndex < categories.Count; rowIndex++)
        {
            var row = new X.Row { RowIndex = (uint)(rowIndex + 2) }; row.Append(InlineStringCell($"A{rowIndex + 2}", categories[rowIndex]));
            for (var seriesIndex = 0; seriesIndex < series.Count; seriesIndex++)
                if (rowIndex < series[seriesIndex].Values.Count) row.Append(new X.Cell { CellReference = $"{SpreadsheetColumn(seriesIndex + 2)}{rowIndex + 2}", DataType = X.CellValues.Number, CellValue = new X.CellValue(series[seriesIndex].Values[rowIndex].ToString("R", CultureInfo.InvariantCulture)) });
            sheetData.Append(row);
        }
        var sheets = workbookPart.Workbook.AppendChild(new X.Sheets()); sheets.Append(new X.Sheet { Id = workbookPart.GetIdOfPart(worksheetPart), SheetId = 1U, Name = sheetName });
        worksheetPart.Worksheet.Save(); workbookPart.Workbook.Save();
    }

    private static X.Cell InlineStringCell(string reference, string value) => new(new X.InlineString(new X.Text(value))) { CellReference = reference, DataType = X.CellValues.InlineString };
    private static string SpreadsheetColumn(int number) { var result = string.Empty; for (var value = number; value > 0; value = (value - 1) / 26) result = (char)('A' + (value - 1) % 26) + result; return result; }

    private static void WriteChartXml(ChartPart chartPart, ChartIr chart, string chartType, string sheetName, IReadOnlyList<string> categories, IReadOnlyList<NativeChartSeriesData> series, string workbookRelationshipId, uint shapeId)
    {
        const string chartNs = "http://schemas.openxmlformats.org/drawingml/2006/chart";
        const string drawingNs = "http://schemas.openxmlformats.org/drawingml/2006/main";
        const string relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        using var writer = XmlWriter.Create(chartPart.GetStream(FileMode.Create, FileAccess.Write), new XmlWriterSettings { Encoding = new UTF8Encoding(false), Indent = false, CloseOutput = true });
        writer.WriteStartDocument(true); writer.WriteStartElement("c", "chartSpace", chartNs); writer.WriteAttributeString("xmlns", "a", null, drawingNs); writer.WriteAttributeString("xmlns", "r", null, relNs);
        Value(writer, "lang", "en-US"); Value(writer, "roundedCorners", "0"); writer.WriteStartElement("c", "chart", chartNs); Value(writer, "autoTitleDeleted", "1"); writer.WriteStartElement("c", "plotArea", chartNs); writer.WriteElementString("c", "layout", chartNs, string.Empty);
        var element = chartType switch { "line" => "lineChart", "pie" => "pieChart", "donut" => "doughnutChart", _ => "barChart" }; writer.WriteStartElement("c", element, chartNs);
        if (element == "barChart") { Value(writer, "barDir", "col"); Value(writer, "grouping", "clustered"); Value(writer, "varyColors", "0"); }
        else if (element == "lineChart") { Value(writer, "grouping", "standard"); Value(writer, "varyColors", "0"); }
        else Value(writer, "varyColors", "1");
        for (var index = 0; index < series.Count; index++) WriteSeries(writer, chart, element, sheetName, categories, series[index], index, drawingNs, chartNs);
        WriteDataLabels(writer, chartNs); if (element == "barChart") Value(writer, "gapWidth", "150"); if (element == "doughnutChart") Value(writer, "holeSize", "55");
        var categoryAxisId = 120000U + shapeId * 2U; var valueAxisId = categoryAxisId + 1U; var needsAxes = element is "barChart" or "lineChart";
        if (needsAxes) { Value(writer, "axId", categoryAxisId.ToString(CultureInfo.InvariantCulture)); Value(writer, "axId", valueAxisId.ToString(CultureInfo.InvariantCulture)); }
        writer.WriteEndElement(); if (needsAxes) WriteAxes(writer, categoryAxisId, valueAxisId, chartNs); writer.WriteEndElement();
        Value(writer, "plotVisOnly", "1"); Value(writer, "dispBlanksAs", "gap"); Value(writer, "showDLblsOverMax", "0"); writer.WriteEndElement();
        writer.WriteStartElement("c", "externalData", chartNs); writer.WriteAttributeString("r", "id", relNs, workbookRelationshipId); Value(writer, "autoUpdate", "0"); writer.WriteEndElement(); writer.WriteEndElement(); writer.WriteEndDocument();
    }

    private static void WriteSeries(XmlWriter writer, ChartIr chart, string chartElement, string sheetName, IReadOnlyList<string> categories, NativeChartSeriesData series, int index, string drawingNs, string chartNs)
    {
        writer.WriteStartElement("c", "ser", chartNs); Value(writer, "idx", index.ToString(CultureInfo.InvariantCulture)); Value(writer, "order", index.ToString(CultureInfo.InvariantCulture));
        writer.WriteStartElement("c", "tx", chartNs); writer.WriteElementString("c", "v", chartNs, series.Name); writer.WriteEndElement();
        writer.WriteStartElement("c", "spPr", chartNs); writer.WriteStartElement("a", "solidFill", drawingNs); writer.WriteStartElement("a", "srgbClr", drawingNs); writer.WriteAttributeString("val", SeriesColor(chart.Style, index)); writer.WriteEndElement(); writer.WriteEndElement(); writer.WriteStartElement("a", "ln", drawingNs); writer.WriteElementString("a", "noFill", drawingNs, string.Empty); writer.WriteEndElement(); writer.WriteEndElement();
        if (chartElement == "lineChart") { writer.WriteStartElement("c", "marker", chartNs); Value(writer, "symbol", "circle"); Value(writer, "size", "5"); writer.WriteEndElement(); }
        writer.WriteStartElement("c", "cat", chartNs); writer.WriteStartElement("c", "strRef", chartNs); writer.WriteElementString("c", "f", chartNs, $"'{sheetName}'!$A$2:$A${categories.Count + 1}"); writer.WriteStartElement("c", "strCache", chartNs); Value(writer, "ptCount", categories.Count.ToString(CultureInfo.InvariantCulture));
        for (var i = 0; i < categories.Count; i++) Point(writer, i, categories[i], chartNs); writer.WriteEndElement(); writer.WriteEndElement(); writer.WriteEndElement();
        writer.WriteStartElement("c", "val", chartNs); writer.WriteStartElement("c", "numRef", chartNs); writer.WriteElementString("c", "f", chartNs, $"'{sheetName}'!${SpreadsheetColumn(index + 2)}$2:${SpreadsheetColumn(index + 2)}${series.Values.Count + 1}"); writer.WriteStartElement("c", "numCache", chartNs); writer.WriteElementString("c", "formatCode", chartNs, "General"); Value(writer, "ptCount", series.Values.Count.ToString(CultureInfo.InvariantCulture));
        for (var i = 0; i < series.Values.Count; i++) Point(writer, i, series.Values[i].ToString("R", CultureInfo.InvariantCulture), chartNs); writer.WriteEndElement(); writer.WriteEndElement(); writer.WriteEndElement();
        if (chartElement == "lineChart") Value(writer, "smooth", "0"); writer.WriteEndElement();
    }

    private static string SeriesColor(JsonElement? style, int index)
    {
        var colors = GetStringArray(style, "seriesFills"); var palette = new[] { "2F80ED", "56CCF2", "6FCF97", "F2C94C", "EB5757", "9B51E0" };
        var value = index < colors.Count ? colors[index] : index == 0 ? GetString(style, "barFill") ?? GetString(style, "accent") : null;
        return NormalizeHex(value ?? palette[index % palette.Length]);
    }

    private static void WriteDataLabels(XmlWriter writer, string ns) { writer.WriteStartElement("c", "dLbls", ns); foreach (var name in new[] { "showLegendKey", "showVal", "showCatName", "showSerName", "showPercent", "showBubbleSize" }) Value(writer, name, "0"); writer.WriteEndElement(); }
    private static void WriteAxes(XmlWriter writer, uint categoryId, uint valueId, string ns)
    {
        writer.WriteStartElement("c", "catAx", ns); Value(writer, "axId", categoryId.ToString(CultureInfo.InvariantCulture)); writer.WriteStartElement("c", "scaling", ns); Value(writer, "orientation", "minMax"); writer.WriteEndElement(); Value(writer, "delete", "0"); Value(writer, "axPos", "b"); Value(writer, "tickLblPos", "nextTo"); Value(writer, "crossAx", valueId.ToString(CultureInfo.InvariantCulture)); Value(writer, "crosses", "autoZero"); Value(writer, "auto", "1"); Value(writer, "lblAlgn", "ctr"); Value(writer, "lblOffset", "100"); writer.WriteEndElement();
        writer.WriteStartElement("c", "valAx", ns); Value(writer, "axId", valueId.ToString(CultureInfo.InvariantCulture)); writer.WriteStartElement("c", "scaling", ns); Value(writer, "orientation", "minMax"); writer.WriteEndElement(); Value(writer, "delete", "0"); Value(writer, "axPos", "l"); writer.WriteElementString("c", "majorGridlines", ns, string.Empty); writer.WriteStartElement("c", "numFmt", ns); writer.WriteAttributeString("formatCode", "General"); writer.WriteAttributeString("sourceLinked", "1"); writer.WriteEndElement(); Value(writer, "tickLblPos", "nextTo"); Value(writer, "crossAx", categoryId.ToString(CultureInfo.InvariantCulture)); Value(writer, "crosses", "autoZero"); Value(writer, "crossBetween", "between"); writer.WriteEndElement();
    }
    private static void Point(XmlWriter writer, int index, string value, string ns) { writer.WriteStartElement("c", "pt", ns); writer.WriteAttributeString("idx", index.ToString(CultureInfo.InvariantCulture)); writer.WriteElementString("c", "v", ns, value); writer.WriteEndElement(); }
    private static void Value(XmlWriter writer, string element, string value) { const string ns = "http://schemas.openxmlformats.org/drawingml/2006/chart"; writer.WriteStartElement("c", element, ns); writer.WriteAttributeString("val", value); writer.WriteEndElement(); }
    private static long ToEmu(double value) => Math.Max(1, checked((long)Math.Round(value * 12700)));
    private static string NormalizeHex(string value) { var hex = value.Trim().TrimStart('#'); if (hex.Length == 3) hex = string.Concat(hex.Select(character => $"{character}{character}")); if (hex.Length == 8) hex = hex[..6]; return hex.Length == 6 && hex.All(Uri.IsHexDigit) ? hex.ToUpperInvariant() : "000000"; }
    private static string? GetString(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static bool? GetBoolean(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : null;
    private static JsonElement? GetObject(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Object ? value : null;
    private static List<string> GetStringArray(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Array ? value.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String).Select(item => item.GetString()!).Take(64).ToList() : [];
}
