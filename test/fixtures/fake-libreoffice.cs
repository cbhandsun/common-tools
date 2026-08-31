using System;
using System.IO;

public static class Program {
  public static int Main(string[] args) {
    string output = null;
    for (int index = 0; index < args.Length - 1; index += 1)
      if (args[index] == "--outdir") output = args[index + 1];
    if (output == null || args.Length == 0) return 2;
    string pdf = Path.Combine(output, Path.GetFileNameWithoutExtension(args[args.Length - 1]) + ".pdf");
    File.WriteAllText(pdf, "%PDF-1.4\n1 0 obj <</Type /Page>> endobj\n2 0 obj <</Type /Page>> endobj\n3 0 obj <</Type /Page>> endobj\n%%EOF\n");
    return 0;
  }
}
