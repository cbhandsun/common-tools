"use strict";

module.exports = async function renderPlaceholder(input) {
  return {
    ok: true,
    data: {
      provider: "render-placeholder",
      renderedPages: [],
      warning: "No PPTX render provider configured. Use PowerPoint or LibreOffice export here.",
      pptx: input.pptx
    }
  };
};
