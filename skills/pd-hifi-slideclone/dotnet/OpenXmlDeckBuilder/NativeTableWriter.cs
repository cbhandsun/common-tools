using System.Text.Json;
using DocumentFormat.OpenXml;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

internal static class NativeTableWriter
{
    public static P.GraphicFrame Create(VisualElementIr table, uint shapeId, P.NonVisualDrawingProperties drawingProperties)
    {
        var rows = table.Rows ?? [];
        if (rows.Count == 0 || rows.Count > 10000 || rows.Any(row => row is null || row.Count > 1000))
            throw new InvalidOperationException($"Table {table.Id} must contain bounded non-null rows.");
        var colCount = Math.Max(1, rows.Max(row => row.Count));
        var rowHeights = Dimensions(table.Style, "rowHeightsPt", rows.Count, table.Box.H);
        var colWidths = Dimensions(table.Style, "columnWidthsPt", colCount, table.Box.W);
        var fill = GetString(table.Style, "fill") ?? "#FFFFFF";
        var stroke = GetString(table.Style, "stroke") ?? "#D0D7DE";
        var textColor = NormalizeHex(GetString(table.Style, "textColor") ?? "#222222");
        var headerFill = GetString(table.Style, "headerFill") ?? fill;
        var headerTextColor = NormalizeHex(GetString(table.Style, "headerTextColor") ?? textColor);
        var bodyFontSize = (int)Math.Round((GetNumber(table.Style, "fontSizePt") ?? 11.5) * 100);
        var headerFontSize = (int)Math.Round((GetNumber(table.Style, "headerFontSizePt") ?? bodyFontSize / 100d) * 100);
        var strokeWidth = ToLineWidth(GetNumber(table.Style, "strokeWidthPt") ?? 0.35);
        var overlayText = UsesOverlayText(table.Style);
        var overlayGrid = UsesOverlayGrid(table.Style);
        var tableGrid = new A.TableGrid();
        for (var index = 0; index < colCount; index++) tableGrid.Append(new A.GridColumn { Width = ToEmu(colWidths[index]) });
        var drawingTable = new A.Table(new A.TableProperties { FirstRow = false, BandRow = false }, tableGrid);

        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            var row = rows[rowIndex];
            var isHeader = rowIndex == 0;
            var tableRow = new A.TableRow { Height = ToEmu(rowHeights[rowIndex]) };
            for (var columnIndex = 0; columnIndex < colCount; columnIndex++)
            {
                var cellStyle = CellStyle(table.Style, rowIndex, columnIndex);
                var fontWeight = isHeader ? GetString(table.Style, "headerWeight") ?? GetString(table.Style, "fontWeight") ?? "bold" : GetString(table.Style, "fontWeight") ?? "regular";
                fontWeight = GetString(cellStyle, "fontWeight") ?? fontWeight;
                var runProperties = new A.RunProperties
                {
                    FontSize = (int)Math.Round((GetNumber(cellStyle, "fontSizePt") ?? (isHeader ? headerFontSize / 100d : bodyFontSize / 100d)) * 100),
                    Bold = string.Equals(fontWeight, "bold", StringComparison.OrdinalIgnoreCase),
                    Language = "en-US"
                };
                runProperties.Append(new A.SolidFill(new A.RgbColorModelHex { Val = NormalizeHex(GetString(cellStyle, "textColor") ?? (isHeader ? headerTextColor : textColor)) }));
                AppendTypeface(runProperties, GetString(cellStyle, "fontFamily") ?? GetString(table.Style, "fontFamily"));
                var cellText = overlayText ? string.Empty : columnIndex < row.Count ? row[columnIndex] : string.Empty;
                tableRow.Append(new A.TableCell(
                    new A.TextBody(
                        new A.BodyProperties
                        {
                            LeftInset = ToInt32Emu(GetNumber(cellStyle, "paddingLeftPt") ?? GetNumber(table.Style, "paddingLeftPt") ?? 5),
                            RightInset = ToInt32Emu(GetNumber(cellStyle, "paddingRightPt") ?? GetNumber(table.Style, "paddingRightPt") ?? 5),
                            TopInset = ToInt32Emu(GetNumber(cellStyle, "paddingTopPt") ?? GetNumber(table.Style, "paddingTopPt") ?? 2),
                            BottomInset = ToInt32Emu(GetNumber(cellStyle, "paddingBottomPt") ?? GetNumber(table.Style, "paddingBottomPt") ?? 2),
                            Anchor = TextAnchor(GetString(cellStyle, "textValign") ?? GetString(table.Style, "textValign") ?? "middle")
                        },
                        new A.ListStyle(),
                        new A.Paragraph(new A.ParagraphProperties { Alignment = TextAlignment(GetString(cellStyle, "textAlign") ?? GetString(table.Style, "textAlign") ?? "left") }, new A.Run(runProperties, new A.Text(cellText)))
                    ),
                    new A.TableCellProperties(
                        Border(overlayGrid ? "none" : GetString(cellStyle, "strokeLeft") ?? GetString(cellStyle, "stroke") ?? stroke, strokeWidth, "left"),
                        Border(overlayGrid ? "none" : GetString(cellStyle, "strokeRight") ?? GetString(cellStyle, "stroke") ?? stroke, strokeWidth, "right"),
                        Border(overlayGrid ? "none" : GetString(cellStyle, "strokeTop") ?? GetString(cellStyle, "stroke") ?? stroke, strokeWidth, "top"),
                        Border(overlayGrid ? "none" : GetString(cellStyle, "strokeBottom") ?? GetString(cellStyle, "stroke") ?? stroke, strokeWidth, "bottom"),
                        Fill(GetString(cellStyle, "fill") ?? (isHeader ? headerFill : fill))
                    )
                ));
            }
            drawingTable.Append(tableRow);
        }

        return new P.GraphicFrame(
            new P.NonVisualGraphicFrameProperties(drawingProperties, new P.NonVisualGraphicFrameDrawingProperties(), new P.ApplicationNonVisualDrawingProperties()),
            new P.Transform(new A.Offset { X = ToEmu(table.Box.X), Y = ToEmu(table.Box.Y) }, new A.Extents { Cx = ToEmu(table.Box.W), Cy = ToEmu(table.Box.H) }),
            new A.Graphic(new A.GraphicData(drawingTable) { Uri = "http://schemas.openxmlformats.org/drawingml/2006/table" })
        );
    }

    public static IEnumerable<VisualElementIr> GridOverlays(VisualElementIr table)
    {
        if (!UsesOverlayGrid(table.Style) || table.Rows is not { Count: > 0 }) yield break;
        var columns = Math.Max(1, table.Rows.Max(row => row.Count));
        var rowHeights = Dimensions(table.Style, "rowHeightsPt", table.Rows.Count, table.Box.H);
        var columnWidths = Dimensions(table.Style, "columnWidthsPt", columns, table.Box.W);
        var interiorOnly = GetBoolean(table.Style, "gridInteriorOnly") == true;
        var style = JsonSerializer.SerializeToElement(new { stroke = GetString(table.Style, "gridStroke") ?? GetString(table.Style, "stroke") ?? "#D0D7DE", strokeWidthPt = GetNumber(table.Style, "strokeWidthPt") ?? 0.35 });
        var y = table.Box.Y;
        for (var row = 0; row <= table.Rows.Count; row++)
        {
            if (!interiorOnly || row > 0 && row < table.Rows.Count) yield return new VisualElementIr($"{table.Id}-grid-h{row}", "line", new BoxIr(table.Box.X, y, table.Box.W, 0), style, null, null, null);
            if (row < table.Rows.Count) y += rowHeights[row];
        }
        var x = table.Box.X;
        for (var column = 0; column <= columns; column++)
        {
            if (!interiorOnly || column > 0 && column < columns) yield return new VisualElementIr($"{table.Id}-grid-v{column}", "line", new BoxIr(x, table.Box.Y, 0, table.Box.H), style, null, null, null);
            if (column < columns) x += columnWidths[column];
        }
    }

    public static IEnumerable<TextBoxIr> TextOverlays(VisualElementIr table)
    {
        if (!UsesOverlayText(table.Style) || table.Rows is not { Count: > 0 }) yield break;
        var columns = Math.Max(1, table.Rows.Max(row => row.Count));
        var rowHeights = Dimensions(table.Style, "rowHeightsPt", table.Rows.Count, table.Box.H);
        var columnWidths = Dimensions(table.Style, "columnWidthsPt", columns, table.Box.W);
        var y = table.Box.Y;
        for (var rowIndex = 0; rowIndex < table.Rows.Count; rowIndex++)
        {
            var row = table.Rows[rowIndex]; var x = table.Box.X; var isHeader = rowIndex == 0;
            for (var columnIndex = 0; columnIndex < columns; columnIndex++)
            {
                var cell = CellStyle(table.Style, rowIndex, columnIndex);
                var fontSize = GetNumber(cell, "fontSizePt") ?? (isHeader ? GetNumber(table.Style, "headerFontSizePt") : null) ?? GetNumber(table.Style, "fontSizePt") ?? 14;
                var weight = GetString(cell, "fontWeight") ?? (isHeader ? GetString(table.Style, "headerWeight") : null) ?? GetString(table.Style, "fontWeight") ?? (isHeader ? "bold" : "regular");
                var color = GetString(cell, "textColor") ?? (isHeader ? GetString(table.Style, "headerTextColor") : null) ?? GetString(table.Style, "textColor") ?? "#111111";
                var left = GetNumber(cell, "paddingLeftPt") ?? GetNumber(table.Style, "textBoxPaddingLeftPt") ?? GetNumber(table.Style, "paddingLeftPt") ?? 5;
                var right = GetNumber(cell, "paddingRightPt") ?? GetNumber(table.Style, "textBoxPaddingRightPt") ?? GetNumber(table.Style, "paddingRightPt") ?? 5;
                var top = GetNumber(cell, "paddingTopPt") ?? GetNumber(table.Style, "textBoxPaddingTopPt") ?? GetNumber(table.Style, "paddingTopPt") ?? 0;
                var bottom = GetNumber(cell, "paddingBottomPt") ?? GetNumber(table.Style, "textBoxPaddingBottomPt") ?? GetNumber(table.Style, "paddingBottomPt") ?? 0;
                yield return new TextBoxIr($"{table.Id}-r{rowIndex}-c{columnIndex}-text", columnIndex < row.Count ? row[columnIndex] : string.Empty,
                    new BoxIr(x + left, y + top, Math.Max(1, columnWidths[columnIndex] - left - right), Math.Max(1, rowHeights[rowIndex] - top - bottom)),
                    new FontIr(GetString(cell, "fontFamily") ?? GetString(table.Style, "fontFamily"), fontSize, weight, color,
                        GetString(cell, "textAlign") ?? GetString(table.Style, "textAlign") ?? "left",
                        GetString(cell, "textValign") ?? GetString(table.Style, "textValign") ?? "middle", null));
                x += columnWidths[columnIndex];
            }
            y += rowHeights[rowIndex];
        }
    }

    private static OpenXmlElement Fill(string color) => IsNone(color) ? new A.NoFill() : new A.SolidFill(new A.RgbColorModelHex { Val = NormalizeHex(color) });
    private static OpenXmlElement Border(string color, int width, string side)
    {
        OpenXmlCompositeElement border = side switch { "left" => new A.LeftBorderLineProperties { Width = width }, "right" => new A.RightBorderLineProperties { Width = width }, "top" => new A.TopBorderLineProperties { Width = width }, _ => new A.BottomBorderLineProperties { Width = width } };
        if (IsNone(color) || width <= 0) border.Append(new A.NoFill());
        else { border.Append(new A.SolidFill(new A.RgbColorModelHex { Val = NormalizeHex(color) })); border.Append(new A.PresetDash { Val = A.PresetLineDashValues.Solid }); }
        return border;
    }
    private static IReadOnlyList<double> Dimensions(JsonElement? style, string property, int count, double total)
    {
        if (count <= 0) return [];
        var fallback = Enumerable.Repeat(total / count, count).ToArray();
        if (style is not { ValueKind: JsonValueKind.Object } || !style.Value.TryGetProperty(property, out var values) || values.ValueKind != JsonValueKind.Array) return fallback;
        var dimensions = values.EnumerateArray().Select(value => value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) ? number : double.NaN).ToArray();
        if (dimensions.Length != count || dimensions.Any(value => !double.IsFinite(value) || value <= 0 || value > 1_000_000)) return fallback;
        var sum = dimensions.Sum(); if (!double.IsFinite(sum) || sum <= 0) return fallback; var scale = total / sum; return dimensions.Select(value => value * scale).ToArray();
    }
    private static JsonElement? CellStyle(JsonElement? style, int rowIndex, int columnIndex)
    {
        if (style is not { ValueKind: JsonValueKind.Object } || rowIndex < 0 || columnIndex < 0 || !style.Value.TryGetProperty("cellStyles", out var rows) || rows.ValueKind != JsonValueKind.Array) return null;
        var row = rows.EnumerateArray().Skip(rowIndex).FirstOrDefault(); if (row.ValueKind != JsonValueKind.Array) return null; var cell = row.EnumerateArray().Skip(columnIndex).FirstOrDefault(); return cell.ValueKind == JsonValueKind.Object ? cell : null;
    }
    private static void AppendTypeface(A.RunProperties properties, string? family) { if (string.IsNullOrWhiteSpace(family)) return; properties.Append(new A.LatinFont { Typeface = family }, new A.EastAsianFont { Typeface = family }, new A.ComplexScriptFont { Typeface = family }); }
    private static A.TextAlignmentTypeValues TextAlignment(string? value) => value?.ToLowerInvariant() switch { "center" or "middle" => A.TextAlignmentTypeValues.Center, "right" or "end" => A.TextAlignmentTypeValues.Right, "justify" => A.TextAlignmentTypeValues.Justified, _ => A.TextAlignmentTypeValues.Left };
    private static A.TextAnchoringTypeValues TextAnchor(string? value) => value?.ToLowerInvariant() switch { "bottom" => A.TextAnchoringTypeValues.Bottom, "middle" or "center" => A.TextAnchoringTypeValues.Center, _ => A.TextAnchoringTypeValues.Top };
    private static bool UsesOverlayText(JsonElement? style) { var mode = GetString(style, "textMode")?.ToLowerInvariant(); return mode is "overlay-textboxes" or "textboxes"; }
    private static bool UsesOverlayGrid(JsonElement? style) { var mode = GetString(style, "gridMode")?.ToLowerInvariant(); return mode is "overlay-lines" or "lines"; }
    private static bool IsNone(string? value) => string.Equals(value, "none", StringComparison.OrdinalIgnoreCase) || string.Equals(value, "transparent", StringComparison.OrdinalIgnoreCase);
    private static string NormalizeHex(string color) { var value = color.Trim().TrimStart('#'); return value.Length == 6 && value.All(Uri.IsHexDigit) ? value.ToUpperInvariant() : "111111"; }
    private static string? GetString(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static double? GetNumber(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number) ? number : null;
    private static bool? GetBoolean(JsonElement? element, string property) => element is { ValueKind: JsonValueKind.Object } && element.Value.TryGetProperty(property, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : null;
    private static long ToEmu(double point) => Math.Max(1, checked((long)Math.Round(point * 12700)));
    private static int ToInt32Emu(double point) => checked((int)Math.Round(point * 12700));
    private static int ToLineWidth(double point) => Math.Max(0, checked((int)Math.Round(point * 12700)));
}
