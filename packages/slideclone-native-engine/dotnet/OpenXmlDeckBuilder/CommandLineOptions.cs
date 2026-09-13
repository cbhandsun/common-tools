public static class CommandLineOptions
{
    private const int MaximumArguments = 256;
    private const int MaximumTokenLength = 32768;

    public static Dictionary<string, string> Parse(string[] args)
    {
        ArgumentNullException.ThrowIfNull(args);
        if (args.Length > MaximumArguments) throw new ArgumentException($"At most {MaximumArguments} command-line arguments are supported.", nameof(args));
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < args.Length; i++)
        {
            var token = args[i] ?? throw new ArgumentException("Command-line arguments cannot contain null values.", nameof(args));
            if (token.Length > MaximumTokenLength) throw new ArgumentException("A command-line argument exceeds the maximum length.", nameof(args));
            if (!token.StartsWith("--", StringComparison.Ordinal)) continue;
            var key = token[2..];
            if (string.IsNullOrWhiteSpace(key) || key.Length > 128 || key.Any(ch => !(char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_')))
            {
                throw new ArgumentException($"Invalid command-line option name: {key}", nameof(args));
            }
            if (result.ContainsKey(key)) throw new ArgumentException($"Duplicate command-line option: {key}", nameof(args));
            if (i + 1 >= args.Length || args[i + 1].StartsWith("--", StringComparison.Ordinal))
            {
                result[key] = "true";
                continue;
            }
            var value = args[++i] ?? throw new ArgumentException($"Command-line option {key} has a null value.", nameof(args));
            if (value.Length > MaximumTokenLength) throw new ArgumentException($"Command-line option {key} exceeds the maximum value length.", nameof(args));
            result[key] = value;
        }
        return result;
    }

    public static bool IsEnabled(IReadOnlyDictionary<string, string> options, string key)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Option key is required.", nameof(key));
        return options.TryGetValue(key, out var value)
            && !string.Equals(value, "false", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(value, "0", StringComparison.OrdinalIgnoreCase);
    }
}
