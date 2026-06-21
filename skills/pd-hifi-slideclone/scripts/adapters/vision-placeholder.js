"use strict";

module.exports = async function visionPlaceholder(input) {
  const regionImages = buildRegionImages(input);
  return {
    ok: true,
    provider: "placeholder",
    data: {
      background: {
        fill: "#FFFFFF"
      },
      textBoxes: (input.ocr?.lines || []).map((line, index) => ({
        id: `p${input.pageIndex}-text-${index}`,
        role: "body",
        text: line.text || "",
        box: line.box || { x: 0, y: 0, w: 100, h: 20 },
        font: {
          family: "Microsoft YaHei",
          sizePt: 14,
          color: "#111111"
        },
        source: {
          pageImage: input.sourceImage,
          ocrProvider: "placeholder",
          visionProvider: "placeholder",
          confidence: line.confidence || 0,
          evidenceBox: line.box || { x: 0, y: 0, w: 100, h: 20 },
          editable: true
        }
      })),
      shapes: [],
      images: [
        {
          id: `p${input.pageIndex}-source-snapshot`,
          type: "source-reference",
          box: { x: 0, y: 0, w: 960, h: 540 },
          assetPath: input.sourceImage,
          style: { opacity: 0.12, assetPath: input.sourceImage },
          source: {
            pageImage: input.sourceImage,
            visionProvider: "placeholder",
            confidence: 0,
            evidenceBox: { x: 0, y: 0, w: 960, h: 540 },
            editable: false,
            nonEditableReason: "Source page retained as low-opacity reference until real vision adapter is configured."
          }
        }
      ].concat(regionImages),
      tables: [],
      charts: [],
      icons: []
    }
  };
};

function buildRegionImages(input) {
  const regions = input.page?.regionProposals || [];
  if (!Array.isArray(regions) || regions.length === 0) return [];
  const pageWidth = input.page?.widthPx || input.page?.width || 1;
  const pageHeight = input.page?.heightPx || input.page?.height || 1;
  const slideWidth = input.slideSize?.widthPt || 960;
  const slideHeight = input.slideSize?.heightPt || 540;
  const scaleX = slideWidth / pageWidth;
  const scaleY = slideHeight / pageHeight;

  return regions.map((region, index) => {
    const box = region.box || { x: 0, y: 0, w: pageWidth, h: pageHeight };
    const slideBox = {
      x: round(box.x * scaleX),
      y: round(box.y * scaleY),
      w: round(box.w * scaleX),
      h: round(box.h * scaleY)
    };
    return {
      id: `p${input.pageIndex}-region-${String(index + 1).padStart(2, "0")}`,
      type: region.type || "embedded-screenshot",
      box: slideBox,
      assetPath: region.cropImage,
      style: {
        opacity: 1,
        assetPath: region.cropImage,
        strategy: region.strategy || "crop-as-image + editable-overlay"
      },
      source: {
        pageImage: input.sourceImage,
        cropImage: region.cropImage,
        visionProvider: "normalize-regions",
        confidence: region.confidence || 0,
        evidenceBox: slideBox,
        evidenceBoxPx: box,
        editable: false,
        nonEditableReason: "Candidate region retained as an image for visual fidelity; OCR text and recognized shapes should be overlaid as editable objects by a production vision adapter.",
        regionReason: region.reason
      }
    };
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
