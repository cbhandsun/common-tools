using System.Text.Json;

public static class ComponentReplacementCommand
{
    public static bool TryRun(IReadOnlyDictionary<string, string> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (!options.TryGetValue("apply-component-replacements-openxml", out var planFile)) return false;
        var dryRun = CommandLineOptions.IsEnabled(options, "dry-run");
        if (!options.TryGetValue("out", out var outFile) && !dryRun)
            throw new ArgumentException("--out is required unless --dry-run is set.", nameof(options));
        var report = OpenXmlComponentReplacementImporter.Apply(
            planFile,
            outFile ?? Path.ChangeExtension(planFile, ".dry-run.pptx"),
            allowMissing: CommandLineOptions.IsEnabled(options, "allow-missing"),
            dryRun
        );
        Console.WriteLine(JsonSerializer.Serialize(report, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        return true;
    }
}
