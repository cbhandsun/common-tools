using System.IO.Compression;

public static class PptxPackageAdmissionValidator
{
    private const long MaximumArchiveBytes = 512L * 1024 * 1024;
    private const int MaximumEntries = 4096;
    private const long MaximumEntryBytes = 128L * 1024 * 1024;
    private const long MaximumExpandedBytes = 1024L * 1024 * 1024;
    private const long CompressionRatioCheckThreshold = 1024L * 1024;
    private const double MaximumCompressionRatio = 500d;

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
