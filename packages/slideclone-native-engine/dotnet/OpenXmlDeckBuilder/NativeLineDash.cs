using A = DocumentFormat.OpenXml.Drawing;

internal static class NativeLineDash
{
    internal static A.PresetLineDashValues Resolve(string dash) => dash switch
    {
        "solid" => A.PresetLineDashValues.Solid,
        "dot" => A.PresetLineDashValues.Dot,
        "dashdot" => A.PresetLineDashValues.DashDot,
        // DrawingML has no short DashDotDot preset.
        "dashdotdot" => A.PresetLineDashValues.DashDot,
        "largedash" => A.PresetLineDashValues.LargeDash,
        "largedashdot" => A.PresetLineDashValues.LargeDashDot,
        "largedashdotdot" => A.PresetLineDashValues.LargeDashDotDot,
        "systemdash" => A.PresetLineDashValues.SystemDash,
        "systemdashdot" => A.PresetLineDashValues.SystemDashDot,
        "systemdashdotdot" => A.PresetLineDashValues.SystemDashDotDot,
        _ => A.PresetLineDashValues.Dash
    };
}
