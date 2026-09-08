using System.Buffers.Binary;

internal static class PortableImageValidator
{
    private static readonly byte[] PngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    private static readonly byte[] PngEnd = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];

    public static void Validate(Stream stream, string contentType, string description, uint maximumDimension, ulong maximumPixels)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead) throw new UnsupportedComponentException($"{description} cannot be safely inspected.");
        if (!stream.CanSeek)
        {
            using var buffer = new MemoryStream();
            stream.CopyTo(buffer);
            Validate(buffer, contentType, description, maximumDimension, maximumPixels);
            return;
        }
        var originalPosition = stream.Position;
        try
        {
            stream.Position = 0;
            if (string.Equals(contentType, "image/png", StringComparison.OrdinalIgnoreCase)) ValidatePng(stream, description, maximumDimension, maximumPixels);
            else if (string.Equals(contentType, "image/jpeg", StringComparison.OrdinalIgnoreCase)) ValidateJpeg(stream, description, maximumDimension, maximumPixels);
            else throw new UnsupportedComponentException($"{description} must use a PNG or JPEG content type.");
        }
        finally
        {
            stream.Position = originalPosition;
        }
    }

    public static void ValidatePng(Stream stream, string description, uint maximumDimension, ulong maximumPixels)
    {
        Span<byte> header = stackalloc byte[24];
        try { stream.ReadExactly(header); }
        catch (EndOfStreamException) { throw Invalid(description, "PNG"); }
        if (!header[..8].SequenceEqual(PngSignature) || BinaryPrimitives.ReadUInt32BigEndian(header.Slice(8, 4)) != 13
            || !header.Slice(12, 4).SequenceEqual("IHDR"u8)) throw Invalid(description, "PNG");
        ValidateDimensions(BinaryPrimitives.ReadUInt32BigEndian(header.Slice(16, 4)), BinaryPrimitives.ReadUInt32BigEndian(header.Slice(20, 4)), description, maximumDimension, maximumPixels);
        if (stream.Length < PngEnd.Length) throw Invalid(description, "PNG");
        stream.Position = stream.Length - PngEnd.Length;
        Span<byte> ending = stackalloc byte[PngEnd.Length];
        stream.ReadExactly(ending);
        if (!ending.SequenceEqual(PngEnd)) throw Invalid(description, "PNG");
    }

    private static void ValidateJpeg(Stream stream, string description, uint maximumDimension, ulong maximumPixels)
    {
        if (stream.Length < 4 || stream.ReadByte() != 0xFF || stream.ReadByte() != 0xD8) throw Invalid(description, "JPEG");
        stream.Position = stream.Length - 2;
        if (stream.ReadByte() != 0xFF || stream.ReadByte() != 0xD9) throw Invalid(description, "JPEG");
        stream.Position = 2;
        var foundDimensions = false;
        while (stream.Position < stream.Length - 2)
        {
            int prefix;
            do { prefix = stream.ReadByte(); } while (prefix >= 0 && prefix != 0xFF);
            if (prefix < 0) break;
            int marker;
            do { marker = stream.ReadByte(); } while (marker == 0xFF);
            if (marker < 0 || marker == 0xD9) break;
            if (marker == 0xDA) break;
            if (marker is 0x00 or 0x01 or >= 0xD0 and <= 0xD7) continue;
            var length = ReadUInt16(stream, description);
            if (length < 2 || stream.Position + length - 2 > stream.Length - 2) throw Invalid(description, "JPEG");
            if (IsStartOfFrame(marker))
            {
                if (length < 8 || stream.ReadByte() < 0) throw Invalid(description, "JPEG");
                var height = ReadUInt16(stream, description);
                var width = ReadUInt16(stream, description);
                var components = stream.ReadByte();
                if (components is <= 0 or > 4 || length != 8 + 3 * components) throw Invalid(description, "JPEG");
                ValidateDimensions((uint)width, (uint)height, description, maximumDimension, maximumPixels);
                foundDimensions = true;
                stream.Position += length - 8;
            }
            else stream.Position += length - 2;
        }
        if (!foundDimensions) throw new UnsupportedComponentException($"{description} JPEG has no valid dimensions.");
    }

    private static bool IsStartOfFrame(int marker) => marker is 0xC0 or 0xC1 or 0xC2 or 0xC3 or 0xC5 or 0xC6 or 0xC7 or 0xC9 or 0xCA or 0xCB or 0xCD or 0xCE or 0xCF;

    private static int ReadUInt16(Stream stream, string description)
    {
        var high = stream.ReadByte();
        var low = stream.ReadByte();
        if (high < 0 || low < 0) throw Invalid(description, "JPEG");
        return (high << 8) | low;
    }

    private static void ValidateDimensions(uint width, uint height, string description, uint maximumDimension, ulong maximumPixels)
    {
        if (width == 0 || height == 0 || width > maximumDimension || height > maximumDimension || (ulong)width * height > maximumPixels)
            throw new UnsupportedComponentException($"{description} has invalid or excessive pixel dimensions.");
    }

    private static UnsupportedComponentException Invalid(string description, string format) => new($"{description} is not a valid {format} payload.");
}
