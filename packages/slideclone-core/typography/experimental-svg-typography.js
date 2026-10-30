"use strict";

// Experimental, renderer-independent proposal; measurements must come from the loaded font.
function createUniformSvgTypography(api) {
  const fail = () => { throw new TypeError("Invalid uniform typography input"); };
  const median = values => { const a = [...values].sort((x, y) => x - y); return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2; };
  const finite = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  function normalize(input, options, measure) {
    if (!options || typeof options.family !== "string" || !options.family || options.family.length > 120 || /[;{}<>"'\\]/u.test(options.family) || [...options.family].some(c => c.codePointAt(0) < 32)
      || !Array.isArray(options.regions) || options.regions.length > 100 || typeof measure !== "function") return fail();
    const regions = options.regions.map(r => {
      if (!r || typeof r.id !== "string" || !r.id || r.id.length > 512 || !r.box || !finite(r.box.x, -8000, 8000) || !finite(r.box.y, -8000, 8000)
        || !finite(r.box.w, 0.001, 8000) || !finite(r.box.h, 0.001, 8000)) return fail();
      return r;
    });
    if (new Set(regions.map(r => r.id)).size !== regions.length) return fail();
    const scene = api.parseDeck(api.exportDeck(input));
    const items = scene.objects.filter(o => o.kind === "text").map(o => {
      const visible = o.runs.filter(r => r.text.trim()), runs = visible.length ? visible : o.runs;
      const x = Math.min(...runs.map(r => r.box.x)), y = Math.min(...runs.map(r => r.box.y));
      const box = { x, y, w: Math.max(...runs.map(r => r.box.x + r.box.w)) - x, h: Math.max(...runs.map(r => r.box.y + r.box.h)) - y };
      const cx = o.box.x + o.box.w / 2, cy = o.box.y + o.box.h / 2;
      const owner = regions.filter(r => cx >= r.box.x && cx <= r.box.x + r.box.w && cy >= r.box.y && cy <= r.box.y + r.box.h)
        .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0];
      const surfaces = scene.objects.filter(s => s.kind === "freeform" && s.fill !== "none" && cx >= s.box.x && cx <= s.box.x + s.box.w && cy >= s.box.y && cy <= s.box.y + s.box.h
        && s.box.w >= o.box.w * 0.8 && s.box.h >= o.box.h * 0.8).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h);
      const container = surfaces[0]?.box ?? owner?.box ?? { x: 0, y: 0, w: scene.width, h: scene.height };
      const availableWidth = Math.max(box.w, container.x + container.w - box.x - 2);
      return { o, box, region: owner?.id ?? "page", availableWidth, height: median(runs.map(r => r.box.h)), size: median(runs.map(r => r.font.sizePt)) };
    });
    const groups = new Map();
    for (const region of new Set(items.map(item => item.region))) {
      const local = items.filter(item => item.region === region).sort((a, b) => a.height - b.height), base = median(local.map(item => item.height));
      let band = -1, minimum = 0, group;
      for (const item of local) {
        if (!group || item.height > minimum * 1.25 || (item.o.outlineWidth > 0) !== group.outlined) {
          minimum = item.height; band++;
          const ratio = item.height / base;
          const tier = item.o.outlineWidth > 0 || ratio >= 2.5 ? "display" : ratio < 0.72 ? "caption" : ratio < 1.5 ? "body" : "heading";
          group = { region, tier, band, outlined: item.o.outlineWidth > 0, items: [] };
          groups.set(JSON.stringify([region, band]), group);
        }
        group.items.push(item);
      }
    }
    const report = { family: options.family, textObjects: items.length, textRuns: items.length, anisotropicTransforms: 0, styles: [], overflow: [] };
    for (const group of groups.values()) {
      const weight = ["heading", "display"].includes(group.tier) ? "bold" : "normal";
      const font = { family: options.family, weight, sizePt: 100 };
      const measurements = group.items.map(item => {
        const m = measure(item.o.text, font);
        if (!m || !finite(m.width, 0, 1e7) || !finite(m.height, 0, 1e7) || item.o.text.trim() && (!m.width || !m.height)) return fail();
        return m;
      });
      const sizes = group.items.flatMap((item, i) => item.o.text.trim() ? [100 * Math.min(item.box.w / measurements[i].width, item.height / measurements[i].height)] : []);
      const weighted = group.items.flatMap((item, i) => item.o.text.trim() ? Array.from({ length: Math.min(100, [...item.o.text].length) }, () => 100 * Math.min(item.box.w / measurements[i].width, item.height / measurements[i].height)) : []);
      const capacity = group.items.flatMap((item, i) => measurements[i].width ? [100 * item.availableWidth / measurements[i].width] : []);
      const proposed = weighted.length ? median(weighted) : sizes.length ? median(sizes) : 12;
      const sizePt = Math.max(1, Math.min(400, Math.floor(Math.min(proposed, ...capacity) * 4) / 4));
      report.styles.push({ region: group.region, tier: group.tier, band: group.band, sizePt, weight, members: group.items.map(item => item.o.id) });
      for (const [i, item] of group.items.entries()) {
        const o = item.o;
        o.fit = false; o.flow = true;
        o.runs = [{ text: o.text, box: item.box, font: { ...o.runs[0].font, ...font, sizePt } }];
        const width = measurements[i].width * sizePt / 100, height = measurements[i].height * sizePt / 100;
        if (o.text.trim() && (width > o.box.w + 1 || height > o.box.h + 1)) report.overflow.push({ id: o.id, width, height, available: o.box });
      }
    }
    // Validate the complete proposal, including sizes and content, before returning it.
    return { scene: api.parseDeck(api.exportDeck(scene)), report };
  }
  return { normalize };
}

if (typeof module !== "undefined") module.exports = { createUniformSvgTypography };
