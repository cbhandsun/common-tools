using System.Security;
using System.Text;
using DocumentFormat.OpenXml.Packaging;
using P = DocumentFormat.OpenXml.Presentation;

public static class SpeakerNotesWriter
{
    private const int MaximumNotesCharacters = 20000;

    public static void Add(PresentationPart presentationPart, SlidePart slidePart, string notes, int pageIndex)
    {
        ArgumentNullException.ThrowIfNull(presentationPart);
        ArgumentNullException.ThrowIfNull(slidePart);
        if (string.IsNullOrWhiteSpace(notes) || notes.Length > MaximumNotesCharacters || notes.Any(character => character < ' ' && character is not '\r' and not '\n' and not '\t'))
            throw new InvalidOperationException("Speaker notes must contain bounded text.");
        var notesMasterPart = EnsureNotesMaster(presentationPart);
        var notesSlidePart = slidePart.AddNewPart<NotesSlidePart>($"rIdNotes{pageIndex + 1}");
        notesSlidePart.AddPart(slidePart, "rIdSlide");
        notesSlidePart.AddPart(notesMasterPart, "rIdNotesMaster");
        var escaped = SecurityElement.Escape(notes) ?? throw new InvalidOperationException("Speaker notes could not be encoded.");
        Feed(notesSlidePart, $"""
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
              <p:cSld><p:spTree>
                <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
                <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
                <p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
                <p:sp><p:nvSpPr><p:cNvPr id="3" name="Speaker Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="3"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>{escaped}</a:t></a:r><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody></p:sp>
                <p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Number"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="5"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="&#123;ED301D1B-7765-4C68-8E63-945671C274A1&#125;" type="slidenum"><a:rPr lang="en-US"/><a:t>{pageIndex + 1}</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
              </p:spTree></p:cSld>
              <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
            </p:notes>
            """);
    }

    private static NotesMasterPart EnsureNotesMaster(PresentationPart presentationPart)
    {
        var existing = presentationPart.NotesMasterPart;
        if (existing is not null) return existing;
        var master = presentationPart.AddNewPart<NotesMasterPart>("rIdNotesMaster");
        Feed(master, """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
              <p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>
                <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
                <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
                <p:sp><p:nvSpPr><p:cNvPr id="2" name="Header Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="hdr" sz="quarter"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2971800" cy="458788"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
                <p:sp><p:nvSpPr><p:cNvPr id="3" name="Date Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3884613" y="0"/><a:ext cx="2971800" cy="458788"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
                <p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Image Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
                <p:sp><p:nvSpPr><p:cNvPr id="5" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
                <p:sp><p:nvSpPr><p:cNvPr id="6" name="Footer Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="4"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="8685213"/><a:ext cx="2971800" cy="458787"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
                <p:sp><p:nvSpPr><p:cNvPr id="7" name="Slide Number Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="5"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3884613" y="8685213"/><a:ext cx="2971800" cy="458787"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>
              </p:spTree></p:cSld>
              <p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>
              <p:notesStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle>
            </p:notesMaster>
            """);
        var theme = presentationPart.ThemePart ?? presentationPart.SlideMasterParts.Select(part => part.ThemePart).FirstOrDefault(part => part is not null);
        if (theme is not null)
        {
            var notesTheme = master.AddNewPart<ThemePart>("rIdTheme");
            using var themeStream = theme.GetStream(FileMode.Open, FileAccess.Read);
            notesTheme.FeedData(themeStream);
        }
        presentationPart.Presentation.NotesMasterIdList = new P.NotesMasterIdList(new P.NotesMasterId { Id = presentationPart.GetIdOfPart(master) });
        return master;
    }

    private static void Feed(OpenXmlPart part, string xml)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));
        part.FeedData(stream);
    }
}
