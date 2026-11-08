using System.Text.Json;
using DocumentFormat.OpenXml;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

internal static class NativePositionedText
{
    public static OpenXmlElement Create(TextBoxIr parent, ref uint shapeId, Func<TextBoxIr, uint, P.Shape> createText)
    {
        var runs = parent.PositionedRuns ?? throw new InvalidOperationException("Positioned text layout is missing.");
        Validate(parent, runs);
        long Emu(double value) => checked((long)Math.Round(value * 12700));
        var group = new P.GroupShape(
            new P.NonVisualGroupShapeProperties(
                new P.NonVisualDrawingProperties { Id = shapeId++, Name = parent.Id },
                new P.NonVisualGroupShapeDrawingProperties(), new P.ApplicationNonVisualDrawingProperties()),
            new P.GroupShapeProperties(new A.TransformGroup(
                new A.Offset { X = Emu(parent.Box.X), Y = Emu(parent.Box.Y) },
                new A.Extents { Cx = Emu(parent.Box.W), Cy = Emu(parent.Box.H) },
                new A.ChildOffset { X = Emu(parent.Box.X), Y = Emu(parent.Box.Y) },
                new A.ChildExtents { Cx = Emu(parent.Box.W), Cy = Emu(parent.Box.H) })));
        // Runs are expressed in the unrotated parent frame. Rotate that frame
        // once; inheriting its angle on every child would rotate the text twice.
        if (parent.Rotation is double rotation && rotation != 0)
            group.GroupShapeProperties!.GetFirstChild<A.TransformGroup>()!.Rotation = checked((int)Math.Round(rotation * 60000));
        for (var index = 0; index < runs.Count; index++)
        {
            var run = runs[index];
            var child = parent with { Id = $"{parent.Id}-position-{index + 1}", Text = run.Text.Trim(), Box = run.Box,
                Font = NativePositionedTextFont.Merge(parent.Font, run.FontOverride), PositionedRuns = null, Role = null,
                Rotation = (parent.Rotation ?? 0) == 0 ? parent.Rotation : null };
            group.Append(createText(child, shapeId++));
        }
        PositionedTextConnectionTarget.Register(group);
        return group;
    }

    private static void Validate(TextBoxIr parent, IReadOnlyList<PositionedTextRunIr> runs)
    {
        if (runs.Count is < 1 or > 512 || parent.Text is null || parent.Text.Length > 512
            || parent.Text.IndexOfAny(['\r', '\n']) >= 0 || parent.Runs is not null
            || (parent.Rotation is double rotation && (!double.IsFinite(rotation) || Math.Abs(rotation) > 180))
            || parent.Wrap != false || parent.Style is not { ValueKind: JsonValueKind.Object } style
            || !style.TryGetProperty("wrap", out var wrap) || wrap.ValueKind != JsonValueKind.False
            || !style.TryGetProperty("fit", out var fit) || fit.GetString() != "none"
            || !style.TryGetProperty("textWarp", out var warp) || warp.GetString() != "textPlain")
            throw new InvalidOperationException("Positioned text layout is invalid.");
        if (!ValidBox(parent.Box)) throw new InvalidOperationException("Positioned text frame is invalid.");
        double previous = double.NegativeInfinity;
        foreach (var run in runs)
        {
            if (run is null || string.IsNullOrWhiteSpace(run.Text) || run.Text.Any(character => character < 32 || character == 127)
                || !ValidBox(run.Box) || run.Box.X < parent.Box.X || run.Box.Y < parent.Box.Y
                || run.Box.X + run.Box.W > parent.Box.X + parent.Box.W || run.Box.Y + run.Box.H > parent.Box.Y + parent.Box.H
                || run.Box.X < previous) throw new InvalidOperationException("Positioned text run is invalid.");
            previous = run.Box.X + run.Box.W;
        }
        if (string.Concat(runs.Select(run => run.Text)) != parent.Text)
            throw new InvalidOperationException("Positioned text sequence is invalid.");
    }

    private static bool ValidBox(BoxIr? box) => box is not null && double.IsFinite(box.X) && double.IsFinite(box.Y)
        && double.IsFinite(box.W) && double.IsFinite(box.H) && box.X >= 0 && box.Y >= 0 && box.W > 0 && box.H > 0;
}
