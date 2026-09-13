using System.IO.Compression;
using System.Text.RegularExpressions;

public static class PptxPackageAdmissionValidator
{
    private const long MaximumArchiveBytes = 512L * 1024 * 1024;
    private const int MaximumEntries = 4096;
    private const long MaximumEntryBytes = 128L * 1024 * 1024;
    private const long MaximumExpandedBytes = 1024L * 1024 * 1024;
    private const long CompressionRatioCheckThreshold = 1024L * 1024;
    private const double MaximumCompressionRatio = 500d;
    private const long MaximumTemplateRelationshipBytes = 32L * 1024 * 1024;

    public static PptxPackageAdmission Validate(string pptxFile, string label)
    {
        if (string.IsNullOrWhiteSpace(pptxFile)) throw new ArgumentException("PPTX path is required.", nameof(pptxFile));
        if (string.IsNullOrWhiteSpace(label)) throw new ArgumentException("PPTX label is required.", nameof(label));

        var normalized = Path.GetFullPath(pptxFile);
        var file = new FileInfo(normalized);
        if (!file.Exists || file.Length <= 0 || file.Length > MaximumArchiveBytes)
            throw new InvalidDataException($"The {label} does not exist, is empty, or exceeds the archive-size limit.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long expandedBytes = 0;
        using var archive = ZipFile.OpenRead(normalized);
        if (archive.Entries.Count == 0 || archive.Entries.Count > MaximumEntries)
            throw new InvalidDataException($"The {label} must contain between 1 and {MaximumEntries} ZIP entries.");

        foreach (var entry in archive.Entries)
        {
            ValidateEntryName(entry.FullName, label);
            if (!names.Add(entry.FullName))
                throw new InvalidDataException($"The {label} contains a duplicate ZIP entry name.");
            if (entry.Length < 0 || entry.CompressedLength < 0 || entry.Length > MaximumEntryBytes)
                throw new InvalidDataException($"The {label} contains a ZIP entry that exceeds the expanded-size limit.");
            try { expandedBytes = checked(expandedBytes + entry.Length); }
            catch (OverflowException) { throw new InvalidDataException($"The {label} expanded size is invalid."); }
            if (expandedBytes > MaximumExpandedBytes)
                throw new InvalidDataException($"The {label} exceeds the total expanded-size limit.");
            if (entry.Length >= CompressionRatioCheckThreshold)
            {
                if (entry.CompressedLength == 0 || entry.Length / (double)entry.CompressedLength > MaximumCompressionRatio)
                    throw new InvalidDataException($"The {label} contains a suspiciously compressed ZIP entry.");
            }
        }

        if (!names.Contains("[Content_Types].xml") || !names.Contains("_rels/.rels") || !names.Contains("ppt/presentation.xml"))
            throw new InvalidDataException($"The {label} is missing required OPC presentation entries.");
        return new PptxPackageAdmission(archive.Entries.Count, expandedBytes);
    }

    public static PptxPackageAdmission ValidateTemplate(string pptxFile)
    {
        var admission = Validate(pptxFile, "PPTX template");
        using var archive = ZipFile.OpenRead(Path.GetFullPath(pptxFile));
        var entries = archive.Entries.ToDictionary(entry => entry.FullName, StringComparer.OrdinalIgnoreCase);
        if (entries.Keys.Any(IsForbiddenTemplateEntry))
            throw new InvalidDataException("The PPTX template contains executable or embedded package content.");
        if (!entries.Keys.Any(name => Regex.IsMatch(name, @"^ppt/slideMasters/slideMaster[1-9]\d*\.xml$", RegexOptions.CultureInvariant))
            || !entries.Keys.Any(name => Regex.IsMatch(name, @"^ppt/slideLayouts/slideLayout[1-9]\d*\.xml$", RegexOptions.CultureInvariant)))
            throw new InvalidDataException("The PPTX template must contain a slide master and layout.");
        var contentTypes = ReadBoundedText(entries["[Content_Types].xml"], 4L * 1024 * 1024, "content types");
        if (Regex.IsMatch(contentTypes, "macroEnabled|vbaProject|activeX|oleObject|digital-signature", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1)))
            throw new InvalidDataException("The PPTX template contains a forbidden content type.");
        long relationshipBytes = 0;
        foreach (var entry in archive.Entries.Where(entry => entry.FullName.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)))
        {
            relationshipBytes = checked(relationshipBytes + entry.Length);
            if (relationshipBytes > MaximumTemplateRelationshipBytes)
                throw new InvalidDataException("The PPTX template relationship XML is too large.");
            var relationships = ReadBoundedText(entry, 4L * 1024 * 1024, "relationships");
            if (Regex.IsMatch(relationships, @"<Relationship\b[^>]*\bTargetMode\s*=\s*(['""])External\1", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1)))
                throw new InvalidDataException("The PPTX template contains external relationships.");
        }
        return admission;
    }

    private static bool IsForbiddenTemplateEntry(string name)
    {
        return name.Equals("ppt/vbaProject.bin", StringComparison.OrdinalIgnoreCase)
            || name.Contains("/activeX/", StringComparison.OrdinalIgnoreCase)
            || name.Contains("/embeddings/", StringComparison.OrdinalIgnoreCase)
            || name.StartsWith("customUI/", StringComparison.OrdinalIgnoreCase)
            || name.StartsWith("_xmlsignatures/", StringComparison.OrdinalIgnoreCase);
    }

    private static string ReadBoundedText(ZipArchiveEntry entry, long maximumBytes, string label)
    {
        if (entry.Length < 0 || entry.Length > maximumBytes) throw new InvalidDataException($"The PPTX template {label} XML is too large.");
        using var stream = entry.Open();
        using var reader = new StreamReader(stream, detectEncodingFromByteOrderMarks: true);
        var value = reader.ReadToEnd();
        if (value.Length > maximumBytes) throw new InvalidDataException($"The PPTX template {label} XML is too large.");
        return value;
    }

    private static void ValidateEntryName(string name, string label)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Contains('\0') || name.StartsWith('/') || name.StartsWith('\\'))
            throw new InvalidDataException($"The {label} contains an invalid ZIP entry name.");
        if (name.Contains('\\')) throw new InvalidDataException($"The {label} contains a non-portable ZIP entry path.");
        var normalized = name.EndsWith('/') ? name[..^1] : name;
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Split('/').Any(segment => segment is "" or "." or ".."))
            throw new InvalidDataException($"The {label} contains an unsafe ZIP entry path.");
    }
}

public sealed record PptxPackageAdmission(int EntryCount, long ExpandedBytes);
