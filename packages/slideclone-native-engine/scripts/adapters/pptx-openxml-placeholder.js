"use strict";

const fs = require("fs");
const path = require("path");

module.exports = async function pptxOpenXmlPlaceholder(input, context) {
  const outFile = path.join(context.outputDir, "pptx", "deck.openxml-adapter-input.json");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify({
    note: "Replace this adapter with a .NET Open XML SDK generator that converts IR into editable PresentationML.",
    irFile: input.irFile,
    slideSize: input.ir.slideSize,
    pages: input.ir.pages.length
  }, null, 2)}\n`, "utf8");
  return {
    ok: true,
    data: {
      provider: "openxml-placeholder",
      adapterInput: outFile,
      pptxFile: null,
      warning: "PPTX was not generated because this is a placeholder adapter."
    }
  };
};
