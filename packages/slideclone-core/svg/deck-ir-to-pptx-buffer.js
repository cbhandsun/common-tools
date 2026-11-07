"use strict";

const zlib = require("node:zlib");

const EMU_PER_PT = 12700;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8");
    const deflated = zlib.deflateRawSync(rawData, { level: 6 });
    const useDeflate = deflated.length < rawData.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? deflated : rawData;
    const crc = crc32(rawData);
    const flags = 0x0800;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(rawData.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(rawData.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + payload.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function emu(pt) {
  const n = Number(pt);
  return Number.isFinite(n) ? Math.round(n * EMU_PER_PT) : 0;
}

function hex6(color, fallback = "000000") {
  if (typeof color !== "string") return fallback;
  const clean = color.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(clean)) return clean;
  if (/^[0-9A-F]{3}$/.test(clean)) {
    return `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
  }
  return fallback;
}

function alphaXml(opacity) {
  if (!Number.isFinite(opacity) || opacity >= 0.999) return "";
  const val = Math.max(0, Math.min(100000, Math.round(opacity * 100000)));
  return `<a:alpha val="${val}"/>`;
}

function renderFillXml(style = {}) {
  const opacity = Number.isFinite(style.fillOpacity)
    ? style.fillOpacity
    : Number.isFinite(style.opacity)
      ? style.opacity
      : 1;
  if (style.gradient && Array.isArray(style.gradient.stops) && style.gradient.stops.length >= 2) {
    const stopsXml = style.gradient.stops
      .map((stop) => {
        const pos = Math.max(0, Math.min(100000, Math.round((Number(stop.position) || 0) * 100000)));
        return `<a:gs pos="${pos}"><a:srgbClr val="${hex6(stop.color, "FFFFFF")}">${alphaXml(opacity)}</a:srgbClr></a:gs>`;
      })
      .join("");
    const angle = Math.round((((Number(style.gradient.angleDeg) || 0) % 360) + 360) % 360 * 60000);
    return `<a:gradFill rotWithShape="1"><a:gsLst>${stopsXml}</a:gsLst><a:lin ang="${angle}" scaled="1"/></a:gradFill>`;
  }
  const fill = style.fill;
  if (!fill || fill === "none" || fill === "transparent") {
    return "<a:noFill/>";
  }
  return `<a:solidFill><a:srgbClr val="${hex6(fill, "FFFFFF")}">${alphaXml(opacity)}</a:srgbClr></a:solidFill>`;
}

function renderLineXml(style = {}) {
  const stroke = style.stroke;
  const strokeWidthPt = Number(style.strokeWidthPt);
  if (!stroke || stroke === "none" || stroke === "transparent" || (Number.isFinite(strokeWidthPt) && strokeWidthPt <= 0)) {
    return "<a:ln><a:noFill/></a:ln>";
  }
  const w = Math.max(6350, emu(Number.isFinite(strokeWidthPt) ? strokeWidthPt : 1));
  const opacity = Number.isFinite(style.strokeOpacity)
    ? style.strokeOpacity
    : Number.isFinite(style.opacity)
      ? style.opacity
      : 1;
  const dashMap = {
    solid: "solid",
    dash: "dash",
    dot: "sysDot",
    dashDot: "dashDot"
  };
  const dashVal = dashMap[style.dash] || dashMap[style.lineDash] || "solid";
  const dashXml = dashVal !== "solid" ? `<a:prstDash val="${dashVal}"/>` : "";
  const headArrow = style.startArrow && style.startArrow !== "none" ? `<a:headEnd type="triangle" w="med" len="med"/>` : "";
  const tailArrow = style.endArrow && style.endArrow !== "none" ? `<a:tailEnd type="triangle" w="med" len="med"/>` : "";
  return `<a:ln w="${w}" cap="flat"><a:solidFill><a:srgbClr val="${hex6(stroke, "000000")}">${alphaXml(opacity)}</a:srgbClr></a:solidFill>${dashXml}${headArrow}${tailArrow}</a:ln>`;
}

function mapPresetGeometry(type) {
  const map = {
    rect: "rect",
    roundRect: "roundRect",
    ellipse: "ellipse",
    circle: "ellipse",
    line: "line",
    connector: "line",
    triangle: "triangle",
    diamond: "diamond",
    parallelogram: "parallelogram",
    trapezoid: "trapezoid",
    chevron: "chevron",
    pentagon: "pentagon",
    hexagon: "hexagon",
    pill: "roundRect"
  };
  return map[type] || "rect";
}

function renderGeometryXml(shape) {
  const style = shape.style || {};
  if (shape.type === "freeform" && Array.isArray(style.freeformSegments) && style.freeformSegments.length > 0) {
    const pathW = Math.max(1000, emu(shape.box.w));
    const pathH = Math.max(1000, emu(shape.box.h));
    const cmds = [];
    for (const seg of style.freeformSegments) {
      const pts = Array.isArray(seg.points) ? seg.points : [];
      if (seg.type === "moveTo" && pts[0]) {
        cmds.push(`<a:moveTo><a:pt x="${Math.round(pts[0].x * pathW)}" y="${Math.round(pts[0].y * pathH)}"/></a:moveTo>`);
      } else if (seg.type === "lnTo" && pts[0]) {
        cmds.push(`<a:lnTo><a:pt x="${Math.round(pts[0].x * pathW)}" y="${Math.round(pts[0].y * pathH)}"/></a:lnTo>`);
      } else if (seg.type === "cubicBezTo" && pts.length >= 3) {
        cmds.push(
          `<a:cubicBezTo>` +
            `<a:pt x="${Math.round(pts[0].x * pathW)}" y="${Math.round(pts[0].y * pathH)}"/>` +
            `<a:pt x="${Math.round(pts[1].x * pathW)}" y="${Math.round(pts[1].y * pathH)}"/>` +
            `<a:pt x="${Math.round(pts[2].x * pathW)}" y="${Math.round(pts[2].y * pathH)}"/>` +
          `</a:cubicBezTo>`
        );
      } else if (seg.type === "quadBezTo" && pts.length >= 2) {
        cmds.push(
          `<a:quadBezTo>` +
            `<a:pt x="${Math.round(pts[0].x * pathW)}" y="${Math.round(pts[0].y * pathH)}"/>` +
            `<a:pt x="${Math.round(pts[1].x * pathW)}" y="${Math.round(pts[1].y * pathH)}"/>` +
          `</a:quadBezTo>`
        );
      } else if (seg.type === "close") {
        cmds.push("<a:close/>");
      }
    }
    if (style.closePath && !cmds.includes("<a:close/>")) {
      cmds.push("<a:close/>");
    }
    return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${pathW}" h="${pathH}">${cmds.join("")}</a:path></a:pathLst></a:custGeom>`;
  }

  const prst = mapPresetGeometry(shape.type);
  if (prst === "roundRect") {
    const minSide = Math.max(1, Math.min(Number(shape.box.w) || 1, Number(shape.box.h) || 1));
    const radiusPt = Number.isFinite(style.radiusPt) ? style.radiusPt : minSide * 0.12;
    const adj = Math.max(0, Math.min(50000, Math.round((radiusPt / minSide) * 100000)));
    return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
  }
  return `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`;
}

function renderShapeXml(shape, numericId) {
  const box = shape.box || { x: 0, y: 0, w: 10, h: 10 };
  const style = shape.style || {};
  const x = emu(box.x);
  const y = emu(box.y);
  const w = Math.max(0, emu(box.w));
  const h = Math.max(0, emu(box.h));
  const rotAttr = Number.isFinite(shape.rotation) && Math.abs(shape.rotation) > 0.001
    ? ` rot="${Math.round(shape.rotation * 60000)}"`
    : "";
  const flipHAttr = style.flipH ? ' flipH="1"' : "";
  const flipVAttr = style.flipV ? ' flipV="1"' : "";

  const isLine = shape.type === "line" || shape.type === "connector";
  if (isLine) {
    const lineW = (Number(box.w) <= 1 && Number(box.h) > 2) ? 0 : w;
    const lineH = (Number(box.h) <= 1 && Number(box.w) > 2) ? 0 : h;
    return (
      `<p:cxnSp>` +
        `<p:nvCxnSpPr>` +
          `<p:cNvPr id="${numericId}" name="${escapeXml(shape.id || `line-${numericId}`)}"/>` +
          `<p:cNvCxnSpPr/>` +
          `<p:nvPr/>` +
        `</p:nvCxnSpPr>` +
        `<p:spPr>` +
          `<a:xfrm${rotAttr}${flipHAttr}${flipVAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${lineW}" cy="${lineH}"/></a:xfrm>` +
          `<a:prstGeom prst="line"><a:avLst/></a:prstGeom>` +
          renderLineXml(style) +
        `</p:spPr>` +
      `</p:cxnSp>`
    );
  }

  return (
    `<p:sp>` +
      `<p:nvSpPr>` +
        `<p:cNvPr id="${numericId}" name="${escapeXml(shape.id || `shape-${numericId}`)}"/>` +
        `<p:cNvSpPr/>` +
        `<p:nvPr/>` +
      `</p:nvSpPr>` +
      `<p:spPr>` +
        `<a:xfrm${rotAttr}${flipHAttr}${flipVAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
        renderGeometryXml(shape) +
        renderFillXml(style) +
        renderLineXml(style) +
      `</p:spPr>` +
      `<p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>` +
    `</p:sp>`
  );
}

function renderTextBoxXml(textBox, numericId) {
  const box = textBox.box || { x: 0, y: 0, w: 100, h: 28 };
  const font = textBox.font || {};
  const style = textBox.style || {};
  const x = emu(box.x);
  const y = emu(box.y);
  const w = Math.max(12700, emu(box.w));
  const h = Math.max(12700, emu(box.h));
  const rotAttr = Number.isFinite(textBox.rotation) && Math.abs(textBox.rotation) > 0.001
    ? ` rot="${Math.round(textBox.rotation * 60000)}"`
    : "";

  const alignMap = { left: "l", center: "ctr", right: "r", justify: "just" };
  const algn = alignMap[font.align || textBox.alignment] || "l";
  const anchorMap = { top: "t", middle: "ctr", bottom: "b" };
  const anchor = anchorMap[font.valign] || "ctr";
  const wrap = textBox.wrap === false || style.wrap === false ? "none" : "square";
  const defaultPadH = wrap === "none" ? 0 : 2;
  const defaultPadV = wrap === "none" ? 0 : 1;
  const lIns = emu(style.marginLeftPt ?? defaultPadH);
  const rIns = emu(style.marginRightPt ?? defaultPadH);
  const tIns = emu(style.marginTopPt ?? defaultPadV);
  const bIns = emu(style.marginBottomPt ?? defaultPadV);

  const baseFamily = font.family || "Microsoft YaHei";
  const latinFamily = font.latinFamily || "Segoe UI";
  const eaFamily = font.eastAsianFamily || baseFamily;
  const baseSize = Math.max(600, Math.round((Number(font.sizePt) || 14) * 100));
  const baseBold = font.weight === "bold" || Number(font.weight) >= 600 ? ' b="1"' : "";
  const baseItalic = font.italic ? ' i="1"' : "";
  const baseColor = hex6(font.color, "111827");

  const lines = String(textBox.text || "").split(/\r?\n/);
  const paragraphsXml = lines
    .map((lineText) => {
      return (
        `<a:p>` +
          `<a:pPr algn="${algn}"/>` +
          `<a:r>` +
            `<a:rPr lang="zh-CN" altLang="en-US" sz="${baseSize}"${baseBold}${baseItalic} dirty="0">` +
              `<a:solidFill><a:srgbClr val="${baseColor}"/></a:solidFill>` +
              `<a:latin typeface="${escapeXml(latinFamily)}"/>` +
              `<a:ea typeface="${escapeXml(eaFamily)}"/>` +
              `<a:cs typeface="${escapeXml(latinFamily)}"/>` +
            `</a:rPr>` +
            `<a:t>${escapeXml(lineText)}</a:t>` +
          `</a:r>` +
        `</a:p>`
      );
    })
    .join("");

  return (
    `<p:sp>` +
      `<p:nvSpPr>` +
        `<p:cNvPr id="${numericId}" name="${escapeXml(textBox.id || `text-${numericId}`)}"/>` +
        `<p:cNvSpPr txBox="1"/>` +
        `<p:nvPr/>` +
      `</p:nvSpPr>` +
      `<p:spPr>` +
        `<a:xfrm${rotAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
        `<a:noFill/>` +
        `<a:ln><a:noFill/></a:ln>` +
      `</p:spPr>` +
      `<p:txBody>` +
        `<a:bodyPr wrap="${wrap}" lIns="${lIns}" tIns="${tIns}" rIns="${rIns}" bIns="${bIns}" anchor="${anchor}"><a:noAutofit/></a:bodyPr>` +
        `<a:lstStyle/>` +
        paragraphsXml +
      `</p:txBody>` +
    `</p:sp>`
  );
}

function renderPicXml(img, numericId, rId) {
  const box = img?.box || { x: 0, y: 0, w: 24, h: 24 };
  const x = emu(box.x);
  const y = emu(box.y);
  const w = Math.max(12700, emu(box.w || 24));
  const h = Math.max(12700, emu(box.h || 24));
  const rot = Number(img?.rotation) || 0;
  const rotAttr = Number.isFinite(rot) && Math.abs(rot) > 0.001 ? ` rot="${Math.round(rot * 60000)}"` : "";
  return (
    `<p:pic>` +
      `<p:nvPicPr>` +
        `<p:cNvPr id="${numericId}" name="${escapeXml(img?.id || `pic-${numericId}`)}"/>` +
        `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>` +
        `<p:nvPr/>` +
      `</p:nvPicPr>` +
      `<p:blipFill>` +
        `<a:blip r:embed="${rId}"/>` +
        `<a:stretch><a:fillRect/></a:stretch>` +
      `</p:blipFill>` +
      `<p:spPr>` +
        `<a:xfrm${rotAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
      `</p:spPr>` +
    `</p:pic>`
  );
}

function renderSlideXml(page, imageRelMap = new Map()) {
  let nextId = 2;
  const shapes = Array.isArray(page.shapes) ? page.shapes : [];
  const images = Array.isArray(page.images) ? page.images : [];
  const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];

  const groups = new Map();
  const topLevelNodes = [];

  for (const shape of shapes) {
    const gid = shape.source?.nativeComponentGroupId;
    if (gid) {
      if (!groups.has(gid)) {
        const groupEntry = { id: gid, items: [] };
        groups.set(gid, groupEntry);
        topLevelNodes.push({ kind: "group", group: groupEntry });
      }
      groups.get(gid).items.push({ kind: "shape", item: shape });
    } else {
      topLevelNodes.push({ kind: "shape", item: shape });
    }
  }

  for (const img of images) {
    if (img && img.id && imageRelMap.has(img.id)) {
      topLevelNodes.push({ kind: "image", item: img, rId: imageRelMap.get(img.id) });
    }
  }

  for (const textBox of textBoxes) {
    const gid = textBox.source?.nativeComponentGroupId;
    if (gid && groups.has(gid)) {
      groups.get(gid).items.push({ kind: "text", item: textBox });
    } else if (gid) {
      const groupEntry = { id: gid, items: [{ kind: "text", item: textBox }] };
      groups.set(gid, groupEntry);
      topLevelNodes.push({ kind: "group", group: groupEntry });
    } else {
      topLevelNodes.push({ kind: "text", item: textBox });
    }
  }

  const spTreeChildren = [];
  for (const node of topLevelNodes) {
    if (node.kind === "shape") {
      spTreeChildren.push(renderShapeXml(node.item, nextId++));
    } else if (node.kind === "image") {
      spTreeChildren.push(renderPicXml(node.item, nextId++, node.rId));
    } else if (node.kind === "text") {
      spTreeChildren.push(renderTextBoxXml(node.item, nextId++));
    } else if (node.kind === "group") {
      const g = node.group;
      if (g.items.length === 1) {
        const single = g.items[0];
        spTreeChildren.push(
          single.kind === "shape"
            ? renderShapeXml(single.item, nextId++)
            : renderTextBoxXml(single.item, nextId++)
        );
      } else if (g.items.length > 1) {
        const minX = Math.min(...g.items.map((entry) => Number(entry.item.box?.x) || 0));
        const minY = Math.min(...g.items.map((entry) => Number(entry.item.box?.y) || 0));
        const maxX = Math.max(...g.items.map((entry) => (Number(entry.item.box?.x) || 0) + (Number(entry.item.box?.w) || 0)));
        const maxY = Math.max(...g.items.map((entry) => (Number(entry.item.box?.y) || 0) + (Number(entry.item.box?.h) || 0)));
        const gx = emu(minX);
        const gy = emu(minY);
        const gw = Math.max(12700, emu(maxX - minX));
        const gh = Math.max(12700, emu(maxY - minY));
        const grpId = nextId++;
        const childXml = g.items
          .map((entry) =>
            entry.kind === "shape"
              ? renderShapeXml(entry.item, nextId++)
              : renderTextBoxXml(entry.item, nextId++)
          )
          .join("");
        spTreeChildren.push(
          `<p:grpSp>` +
            `<p:nvGrpSpPr>` +
              `<p:cNvPr id="${grpId}" name="${escapeXml(g.id)}"/>` +
              `<p:cNvGrpSpPr/>` +
              `<p:nvPr/>` +
            `</p:nvGrpSpPr>` +
            `<p:grpSpPr>` +
              `<a:xfrm>` +
                `<a:off x="${gx}" y="${gy}"/>` +
                `<a:ext cx="${gw}" cy="${gh}"/>` +
                `<a:chOff x="${gx}" y="${gy}"/>` +
                `<a:chExt cx="${gw}" cy="${gh}"/>` +
              `</a:xfrm>` +
            `</p:grpSpPr>` +
            childXml +
          `</p:grpSp>`
        );
      }
    }
  }

  const bgFill = hex6(page.background?.fill || page.background?.color, "FFFFFF");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
      `<p:cSld>` +
        `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgFill}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
        `<p:spTree>` +
          `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
          spTreeChildren.join("") +
        `</p:spTree>` +
      `</p:cSld>` +
      `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
    `</p:sld>`
  );
}

function buildPptxBufferFromDeckIr(ir) {
  if (!ir || typeof ir !== "object" || !Array.isArray(ir.pages) || ir.pages.length < 1) {
    throw new TypeError("Deck IR must contain at least one page");
  }
  const widthEmu = emu(ir.slideSize?.widthPt || 960);
  const heightEmu = emu(ir.slideSize?.heightPt || 540);
  const pages = ir.pages;

  const slideOverrides = pages
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    )
    .join("");

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
      `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
      `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
      slideOverrides +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;

  const slideRelEntries = pages
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
    )
    .join("");

  const presentationRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
      slideRelEntries +
      `<Relationship Id="rId${pages.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
    `</Relationships>`;

  const sldIdEntries = pages
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join("");

  const presentationXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      `<p:sldIdLst>${sldIdEntries}</p:sldIdLst>` +
      `<p:sldSz cx="${widthEmu}" cy="${heightEmu}"/>` +
      `<p:notesSz cx="${heightEmu}" cy="${widthEmu}"/>` +
    `</p:presentation>`;

  const slideMasterXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
      `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>` +
      `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
      `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `</p:sldMaster>`;

  const slideMasterRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>` +
    `</Relationships>`;

  const slideLayoutXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">` +
      `<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>` +
      `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
    `</p:sldLayout>`;

  const slideLayoutRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
    `</Relationships>`;

  const themeXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CommonToolsTheme">` +
      `<a:themeElements>` +
        `<a:clrScheme name="CommonTools">` +
          `<a:dk1><a:srgbClr val="0F172A"/></a:dk1>` +
          `<a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>` +
          `<a:dk2><a:srgbClr val="1E293B"/></a:dk2>` +
          `<a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>` +
          `<a:accent1><a:srgbClr val="3B82F6"/></a:accent1>` +
          `<a:accent2><a:srgbClr val="10B981"/></a:accent2>` +
          `<a:accent3><a:srgbClr val="8B5CF6"/></a:accent3>` +
          `<a:accent4><a:srgbClr val="F59E0B"/></a:accent4>` +
          `<a:accent5><a:srgbClr val="EC4899"/></a:accent5>` +
          `<a:accent6><a:srgbClr val="06B6D4"/></a:accent6>` +
          `<a:hlink><a:srgbClr val="2563EB"/></a:hlink>` +
          `<a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>` +
        `</a:clrScheme>` +
        `<a:fontScheme name="CommonToolsFonts">` +
          `<a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Segoe UI"/></a:majorFont>` +
          `<a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Segoe UI"/></a:minorFont>` +
        `</a:fontScheme>` +
        `<a:fmtScheme name="CommonToolsFmt">` +
          `<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
          `<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
          `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
          `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>` +
        `</a:fmtScheme>` +
      `</a:themeElements>` +
    `</a:theme>`;

  const coreXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${escapeXml(ir.meta?.title || "Common Tools Editable Deck")}</dc:title>` +
      `<dc:creator>Common Tools SVG-to-PPTX Compiler</dc:creator>` +
    `</cp:coreProperties>`;

  const appXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
      `<Application>Common Tools</Application>` +
      `<Slides>${pages.length}</Slides>` +
    `</Properties>`;

  const entries = [
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: rootRelsXml },
    { name: "docProps/core.xml", data: coreXml },
    { name: "docProps/app.xml", data: appXml },
    { name: "ppt/presentation.xml", data: presentationXml },
    { name: "ppt/_rels/presentation.xml.rels", data: presentationRelsXml },
    { name: "ppt/slideMasters/slideMaster1.xml", data: slideMasterXml },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: slideMasterRelsXml },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: slideLayoutXml },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: slideLayoutRelsXml },
    { name: "ppt/theme/theme1.xml", data: themeXml }
  ];

  const addedMediaNames = new Set();
  pages.forEach((page, index) => {
    const num = index + 1;
    const imageRelMap = new Map();
    const relEntries = [
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
    ];
    for (const img of page.images || []) {
      if (!img || !img.id || img.id === "full-slide-residual") continue;
      let pngBuf = Buffer.isBuffer(img.pngBuffer) ? img.pngBuffer : null;
      if (!pngBuf && typeof img.dataUri === "string" && img.dataUri.startsWith("data:image/png;base64,")) {
        pngBuf = Buffer.from(img.dataUri.slice("data:image/png;base64,".length), "base64");
      }
      if (!pngBuf) continue;
      const safeId = String(img.id).replace(/[^A-Za-z0-9_-]/g, "_");
      const mediaFile = `${safeId}.png`;
      const mediaPath = `ppt/media/${mediaFile}`;
      if (!addedMediaNames.has(mediaPath)) {
        addedMediaNames.add(mediaPath);
        entries.push({ name: mediaPath, data: pngBuf });
      }
      const rId = `rId_${safeId}`;
      imageRelMap.set(img.id, rId);
      relEntries.push(
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaFile}"/>`
      );
    }
    const slideRelsXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        relEntries.join("") +
      `</Relationships>`;
    entries.push({ name: `ppt/slides/slide${num}.xml`, data: renderSlideXml(page, imageRelMap) });
    entries.push({ name: `ppt/slides/_rels/slide${num}.xml.rels`, data: slideRelsXml });
  });

  return buildZipBuffer(entries);
}

module.exports = {
  buildPptxBufferFromDeckIr,
  buildZipBuffer,
  renderShapeXml,
  renderTextBoxXml
};
