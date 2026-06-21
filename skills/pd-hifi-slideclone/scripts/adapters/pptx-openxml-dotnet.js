"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

module.exports = async function pptxOpenXmlDotnet(input, context) {
  const projectDir = path.join(context.skillRoot, "dotnet", "OpenXmlDeckBuilder");
  const outFile = path.join(context.outputDir, "pptx", "deck.pptx");
  const dotnet = resolveDotnet(context);
  await run(dotnet, [
    "run",
    "--project",
    path.join(projectDir, "OpenXmlDeckBuilder.csproj"),
    "--",
    "--ir",
    input.irFile,
    "--out",
    outFile
  ], projectDir);
  return {
    ok: true,
    data: {
      provider: "openxml-dotnet",
      pptxFile: outFile
    }
  };
};

function resolveDotnet(context) {
  if (process.env.DOTNET_BIN) return process.env.DOTNET_BIN;
  const local = path.resolve(context.skillRoot, "..", "..", ".tools", "dotnet", "dotnet.exe");
  if (fs.existsSync(local)) return local;
  return "dotnet";
}
