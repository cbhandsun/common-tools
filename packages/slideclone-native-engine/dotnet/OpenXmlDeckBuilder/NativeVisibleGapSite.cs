using System.Text.Json;

// A source-visible gap uses a logical connection site on the actual owner.
// It changes no drawing extents/path and does not claim physical ink contact.
internal static class NativeVisibleGapSite
{
    internal static void Validate(JsonElement anchor, uint side)
    {
        if (!anchor.TryGetProperty("siteOffsetKind", out _)) return;
        if (!Number(anchor, "dxPt", 0, out var dx) || !Number(anchor, "dyPt", 0, out var dy)
            || !Number(anchor, "position", 0.5, out var position) || position < 0 || position > 1)
            throw new InvalidDataException("Native visible-gap connection site is invalid");
        Read(anchor, side, dx, dy);
    }

    private static bool Number(JsonElement anchor, string key, double fallback, out double number)
    {
        number = fallback;
        return !anchor.TryGetProperty(key, out var value)
            || value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out number) && double.IsFinite(number);
    }

    internal static bool Read(JsonElement anchor, uint side, double dx, double dy)
    {
        if (!anchor.TryGetProperty("siteOffsetKind", out var kind)) return false;
        var diagonal = kind.ValueKind == JsonValueKind.String && kind.GetString() == "source-visible-diagonal-gap";
        if (kind.ValueKind != JsonValueKind.String || kind.GetString() != "source-visible-gap" && !diagonal
            || !double.IsFinite(dx) || !double.IsFinite(dy)
            || Math.Abs(dx) > 100000 || Math.Abs(dy) > 100000
            || side > 3
            || side == 0 && (!diagonal && dx != 0 || dy > 0)
            || side == 1 && (!diagonal && dy != 0 || dx > 0)
            || side == 2 && (!diagonal && dx != 0 || dy < 0)
            || side == 3 && (!diagonal && dy != 0 || dx < 0))
            throw new InvalidDataException("Native visible-gap connection site is invalid");
        return true;
    }
}
