"use strict";

module.exports = async function polishPlaceholder(input) {
  const cloned = JSON.parse(JSON.stringify(input.ir));
  cloned.pages = (cloned.pages || []).map((page) => ({
    ...page,
    polishNotes: [
      ...(page.polishNotes || []),
      {
        iteration: input.iteration,
        provider: "polish-placeholder",
        note: "No coordinate/font/color changes applied. Replace with a model or rules adapter driven by compare findings."
      }
    ]
  }));
  return {
    ok: true,
    data: {
      provider: "polish-placeholder",
      iteration: input.iteration,
      changed: false,
      ir: cloned,
      changes: []
    }
  };
};
