using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeFontTypeface
{
    // Windows exposes these fonts under localized family names. LibreOffice's
    // PPTX importer does not resolve every English alias (including DengXian
    // and KaiTi) and silently substitutes other fonts. These names describe
    // the same installed face; this is not a choice of a different font.
    private static readonly IReadOnlyDictionary<string, string> WindowsAliases =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["DengXian"] = "等线",
            ["DengXian Light"] = "等线 Light",
            ["KaiTi"] = "楷体",
            ["STKaiti"] = "华文楷体",
            ["STXingkai"] = "华文行楷",
            ["STXihei"] = "华文细黑",
            ["STXinwei"] = "华文新魏",
            ["FangSong"] = "仿宋",
            ["STFangsong"] = "华文仿宋",
            ["YouYuan"] = "幼圆",
            ["LiSu"] = "隶书"
        };

    public static string? Resolve(string? family)
    {
        if (string.IsNullOrWhiteSpace(family)) return null;
        if (OperatingSystem.IsWindows() && WindowsAliases.TryGetValue(family, out var installedName))
            return installedName;
        return family;
    }

    public static void Apply(A.RunProperties properties, string? family, string? latinFamily = null,
        string? eastAsianFamily = null, string? complexScriptFamily = null)
    {
        foreach (var value in new[] { latinFamily, eastAsianFamily, complexScriptFamily })
            if (value is not null && (value.Length is < 1 or > 256 || string.IsNullOrWhiteSpace(value)
                || value.Any(character => character < 32 || character == 127)))
                throw new InvalidOperationException("Native script font family is invalid.");
        var latin = Resolve(latinFamily ?? family);
        var eastAsian = Resolve(eastAsianFamily ?? family);
        var complexScript = Resolve(complexScriptFamily ?? family);
        if (latin is not null) properties.Append(new A.LatinFont { Typeface = latin });
        if (eastAsian is not null) properties.Append(new A.EastAsianFont { Typeface = eastAsian });
        if (complexScript is not null) properties.Append(new A.ComplexScriptFont { Typeface = complexScript });
    }
}
