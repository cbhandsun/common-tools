"use strict";

const { execFile } = require("child_process");
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

module.exports = async function pptxPythonPptx(input, context) {
  const outFile = path.join(context.outputDir, "pptx", "deck.pptx");
  const script = path.join(context.skillRoot, "scripts", "python", "build_pptx.py");
  const python = process.env.PYTHON_BIN || "python";
  await run(python, [script, "--ir", input.irFile, "--out", outFile], context.outputDir);
  return {
    ok: true,
    data: {
      provider: "python-pptx",
      pptxFile: outFile
    }
  };
};
