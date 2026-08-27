"use strict";

async function processPages(options) {
  const {
    pages,
    slideSize,
    ocr,
    vision,
    context,
    requestedConcurrency = 1
  } = options || {};
  if (!Array.isArray(pages)) throw new TypeError("pages must be an array");
  if (typeof ocr !== "function") throw new TypeError("ocr adapter must be a function");
  if (typeof vision !== "function") throw new TypeError("vision adapter must be a function");

  const concurrency = resolvePageConcurrency(requestedConcurrency, [ocr, vision]);
  const results = await mapLimited(pages, concurrency, async (pageInput, index) => {
    const pageMeta = typeof pageInput === "string" ? { sourceImage: pageInput } : pageInput;
    if (!pageMeta || typeof pageMeta !== "object" || typeof pageMeta.sourceImage !== "string" || !pageMeta.sourceImage) {
      throw new Error(`page ${index} is missing sourceImage`);
    }
    const sourceImage = pageMeta.sourceImage;
    const ocrResult = assertAdapterOk(`ocr page ${index}`, await ocr({
      pageIndex: index,
      sourceImage,
      page: pageMeta,
      slideSize
    }, context));
    const visionResult = assertAdapterOk(`vision page ${index}`, await vision({
      pageIndex: index,
      sourceImage,
      page: pageMeta,
      slideSize,
      ocr: ocrResult.data
    }, context));

    return {
      pageIndex: index,
      sourceImage,
      background: visionResult.data.background || {},
      textBoxes: visionResult.data.textBoxes || [],
      shapes: visionResult.data.shapes || [],
      images: visionResult.data.images || [],
      tables: visionResult.data.tables || [],
      charts: visionResult.data.charts || [],
      icons: visionResult.data.icons || []
    };
  });

  return { concurrency, pages: results };
}

async function mapLimited(items, concurrency, worker) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  if (items.length === 0) return [];
  if (typeof worker !== "function") throw new TypeError("worker must be a function");
  const limit = normalizeConcurrency(concurrency);
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function resolvePageConcurrency(requested, adapters) {
  const requestedLimit = normalizeConcurrency(requested);
  const adapterLimits = adapters.map((adapter) => {
    const advertised = Number(adapter?.maxConcurrency);
    return Number.isInteger(advertised) && advertised >= 1 && advertised <= 8 ? advertised : 1;
  });
  return Math.min(requestedLimit, ...adapterLimits);
}

function normalizeConcurrency(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 8) {
    throw new RangeError("page concurrency must be an integer from 1 to 8");
  }
  return number;
}

function assertAdapterOk(stage, result) {
  if (!result || result.ok !== true) {
    const message = result?.error || result?.message || "adapter returned a non-ok result";
    throw new Error(`${stage} failed: ${message}`);
  }
  return result;
}

module.exports = {
  mapLimited,
  processPages,
  resolvePageConcurrency
};
