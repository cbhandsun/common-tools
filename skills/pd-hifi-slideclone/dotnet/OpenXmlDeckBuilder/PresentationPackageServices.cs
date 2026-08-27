using System.IO.Compression;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

public static class PresentationPackageServices
{
    public static void Validate(PresentationDocument document)
    {
        ArgumentNullException.ThrowIfNull(document);
        // A valid package still receives a complete SDK walk. Invalid packages
        // stop after enough evidence for the bounded diagnostic below.
        var validationErrors = new OpenXmlValidator(FileFormatVersions.Office2019).Validate(document).Take(51).ToList();
        if (validationErrors.Count == 0) return;
        foreach (var error in validationErrors.Take(50))
        {
            Console.Error.WriteLine($"{error.Path?.XPath}: {error.Description}");
        }
        throw new InvalidOperationException($"Generated PPTX is not valid Open XML. Error count: {validationErrors.Count}");
    }

    public static void AddTheme(PresentationPart presentationPart, SlideMasterPart masterPart)
    {
        ArgumentNullException.ThrowIfNull(presentationPart);
        ArgumentNullException.ThrowIfNull(masterPart);
        var themePart = presentationPart.AddNewPart<ThemePart>("rIdTheme");
        masterPart.AddPart(themePart, "rIdTheme");
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

    public static void FixContentTypes(string pptxFile)
    {
        if (string.IsNullOrWhiteSpace(pptxFile)) throw new ArgumentException("PPTX path is required.", nameof(pptxFile));
        using var archive = ZipFile.Open(pptxFile, ZipArchiveMode.Update);
        var entry = archive.GetEntry("[Content_Types].xml")
            ?? throw new InvalidOperationException("PPTX is missing [Content_Types].xml");
        string xml;
        using (var reader = new StreamReader(entry.Open(), Encoding.UTF8)) xml = reader.ReadToEnd();
        xml = xml.Replace(
            "<Default Extension=\"xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\" />",
            "<Default Extension=\"xml\" ContentType=\"application/xml\" />",
            StringComparison.Ordinal
        );
        if (!xml.Contains("PartName=\"/ppt/presentation.xml\"", StringComparison.OrdinalIgnoreCase))
        {
            xml = xml.Replace(
                "</Types>",
                "<Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\" /></Types>",
                StringComparison.Ordinal
            );
        }
        entry.Delete();
        var newEntry = archive.CreateEntry("[Content_Types].xml");
        using var writer = new StreamWriter(newEntry.Open(), new UTF8Encoding(false));
        writer.Write(xml);
    }
}
