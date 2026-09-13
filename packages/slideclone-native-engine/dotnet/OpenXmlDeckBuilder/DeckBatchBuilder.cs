using System.Text.Json;

public static class DeckBatchBuilder
{
    public delegate void DeckBuildOperation(string irFile, string outFile, bool echo, bool powerpointSafe, string? templatePptx);

    public static IReadOnlyList<string> Build(string batchFile, bool powerpointSafe, DeckBuildOperation buildDeck)
    {
        if (string.IsNullOrWhiteSpace(batchFile)) throw new ArgumentException("Batch manifest path is required.", nameof(batchFile));
        ArgumentNullException.ThrowIfNull(buildDeck);
        var batchFullPath = Path.GetFullPath(batchFile);
        if (!File.Exists(batchFullPath)) throw new FileNotFoundException("Batch manifest was not found.", batchFullPath);
        var batchDirectory = Path.GetDirectoryName(batchFullPath) ?? Directory.GetCurrentDirectory();
        if (new FileInfo(batchFullPath).Length > 16L * 1024 * 1024) throw new InvalidOperationException("Batch manifest exceeds the 16 MiB limit.");
        var json = File.ReadAllText(batchFullPath);
        var manifest = JsonSerializer.Deserialize<BatchBuildManifest>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? throw new InvalidOperationException("Invalid batch manifest JSON.");
        if (manifest.Jobs is null || manifest.Jobs.Count == 0) throw new InvalidOperationException("Batch manifest must include at least one job.");
        if (manifest.Jobs.Count > 10000) throw new InvalidOperationException("Batch manifest exceeds the 10000 job limit.");

        var jobs = manifest.Jobs.Select((job, index) =>
        {
            if (string.IsNullOrWhiteSpace(job.Ir) || string.IsNullOrWhiteSpace(job.Out))
            {
                throw new InvalidOperationException("Batch jobs require non-empty ir and out paths.");
            }
            var irFile = ResolvePath(batchDirectory, job.Ir);
            var outFile = ResolvePath(batchDirectory, job.Out);
            var templatePptx = string.IsNullOrWhiteSpace(job.TemplatePptx) ? null : ResolvePath(batchDirectory, job.TemplatePptx);
            return new ResolvedBatchJob(index, irFile, outFile, templatePptx);
        }).ToArray();
        ValidateDistinctOutputs(jobs);

        var concurrency = ResolveConcurrency(manifest.Concurrency, jobs.Length);
        Parallel.ForEach(jobs, new ParallelOptions { MaxDegreeOfParallelism = concurrency }, job =>
        {
            buildDeck(job.IrFile, job.OutFile, false, powerpointSafe, job.TemplatePptx);
        });
        return jobs.OrderBy(job => job.Index).Select(job => job.OutFile).ToArray();
    }

    public static int ResolveConcurrency(int? requested, int jobCount, int? processorCount = null, long? availableMemoryBytes = null)
    {
        if (jobCount <= 1) return 1;
        if (requested is <= 0 or > 8) throw new InvalidOperationException("Batch concurrency must be between 1 and 8.");
        if (requested.HasValue) return Math.Min(requested.Value, jobCount);

        var cpus = Math.Max(1, processorCount ?? Environment.ProcessorCount);
        var memoryBytes = Math.Max(0, availableMemoryBytes ?? GC.GetGCMemoryInfo().TotalAvailableMemoryBytes);
        var resourceLimit = cpus >= 12 && memoryBytes >= 32L * 1024 * 1024 * 1024
            ? 4
            : cpus >= 6 && memoryBytes >= 8L * 1024 * 1024 * 1024
                ? 2
                : 1;
        return Math.Min(resourceLimit, jobCount);
    }

    private static void ValidateDistinctOutputs(IEnumerable<ResolvedBatchJob> jobs)
    {
        var comparer = OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;
        var duplicate = jobs.GroupBy(job => job.OutFile, comparer).FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null) throw new InvalidOperationException("Batch jobs must use distinct output paths.");
    }

    private static string ResolvePath(string baseDirectory, string value)
    {
        if (value.Contains('\0')) throw new InvalidOperationException("Batch paths cannot contain null characters.");
        return Path.IsPathFullyQualified(value) ? Path.GetFullPath(value) : Path.GetFullPath(Path.Combine(baseDirectory, value));
    }

    private sealed record ResolvedBatchJob(int Index, string IrFile, string OutFile, string? TemplatePptx);
}
