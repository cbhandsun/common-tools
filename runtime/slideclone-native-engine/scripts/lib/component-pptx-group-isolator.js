"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readZipEntryText, rewriteZipEntries } = require("./pptx-zip");

function isolatePptxComponentGroup({ input, output, slide = 1, groupIndex = 0 } = {}) {
  const source = safePptxFile(input);
  if (!source) throw new Error("PPTX isolation input is not readable");
  const target = safeOutputPptx(output);
  if (!target) throw new Error("PPTX isolation output is invalid");
  const slideNumber = boundedInteger(slide, 1, 10000, 1);
  const selectedIndex = boundedInteger(groupIndex, 0, 10000, 0);
  const entryName = `ppt/slides/slide${slideNumber}.xml`;
  const xml = readZipEntryText(source, entryName);
  if (!xml || Buffer.byteLength(xml, "utf8") > 16 * 1024 * 1024) throw new Error("PPTX slide XML is missing or exceeds the isolation boundary");
  const isolated = isolateSlideXmlGroup(xml, selectedIndex);
  const rewritten = rewriteZipEntries(source, target, { [entryName]: Buffer.from(isolated.xml, "utf8") });
  return {
    provider: "component-pptx-group-isolator-v1",
    input: source,
    output: target,
    slide: slideNumber,
    groupIndex: selectedIndex,
    removedTopLevelObjects: isolated.removedTopLevelObjects,
    keptGroupName: isolated.keptGroupName,
    entries: rewritten.entries
  };
}

function isolateSlideXmlGroup(xml, groupIndex = 0) {
  const source = String(xml || "");
  const open = /<p:spTree\b[^>]*>/i.exec(source);
  if (!open) throw new Error("Slide XML has no shape tree");
  const innerStart = open.index + open[0].length;
  const closeIndex = source.indexOf("</p:spTree>", innerStart);
  if (closeIndex < 0) throw new Error("Slide XML shape tree is malformed");
  const children = directXmlChildren(source.slice(innerStart, closeIndex));
  const groups = children.filter((child) => child.localName === "grpSp");
  const selectedIndex = boundedInteger(groupIndex, 0, 10000, 0);
  const selected = groups[selectedIndex];
  if (!selected) throw new Error("Selected component group is not present on the slide");
  const kept = children.filter((child) => ["nvGrpSpPr", "grpSpPr"].includes(child.localName) || child === selected);
  const indent = detectIndent(source.slice(innerStart, closeIndex));
  const replacement = `\n${kept.map((child) => `${indent}${child.xml.trim()}`).join("\n")}\n`;
  let output = `${source.slice(0, innerStart)}${replacement}${source.slice(closeIndex)}`;
  output = output.replace(/<p:sld\b([^>]*)>/i, (tag, attrs) => {
    const cleaned = attrs.replace(/\s+showMasterSp=(?:"[^"]*"|'[^']*')/i, "");
    return `<p:sld${cleaned} showMasterSp="0">`;
  });
  return {
    xml: output,
    removedTopLevelObjects: children.filter((child) => !kept.includes(child)).length,
    keptGroupName: groupName(selected.xml)
  };
}

function directXmlChildren(inner) {
  const children = [];
  const tagPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g;
  let depth = 0;
  let start = -1;
  let rootName = "";
  let match;
  while ((match = tagPattern.exec(inner))) {
    if (!match[1]) continue;
    const tag = match[0];
    const name = match[1];
    const closing = /^<\//.test(tag);
    const selfClosing = /\/\s*>$/.test(tag);
    if (!closing && depth === 0) {
      start = match.index;
      rootName = name;
    }
    if (closing) depth -= 1;
    else if (!selfClosing) depth += 1;
    if ((selfClosing && depth === 0) || (closing && depth === 0)) {
      if (start < 0 || depth < 0) throw new Error("Slide XML shape tree contains malformed children");
      children.push({
        name: rootName,
        localName: rootName.includes(":") ? rootName.split(":").pop() : rootName,
        xml: inner.slice(start, tagPattern.lastIndex)
      });
      start = -1;
      rootName = "";
    }
  }
  if (depth !== 0 || start >= 0) throw new Error("Slide XML shape tree contains unbalanced children");
  return children;
}

function groupName(xml) {
  const match = String(xml).match(/<p:cNvPr\b[^>]*\bname=(?:"([^"]*)"|'([^']*)')/i);
  return decodeXml(match?.[1] || match?.[2] || "").slice(0, 160);
}

function decodeXml(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function detectIndent(inner) {
  const match = String(inner).match(/\n([ \t]+)</);
  return match?.[1] || "  ";
}

function safePptxFile(value) {
  try {
    const resolved = fs.realpathSync(path.resolve(String(value || "")));
    const stat = fs.statSync(resolved);
    return /\.pptx$/i.test(resolved) && stat.isFile() && stat.size > 0 && stat.size <= 64 * 1024 * 1024 ? resolved : "";
  } catch {
    return "";
  }
}

function safeOutputPptx(value) {
  const resolved = path.resolve(String(value || ""));
  return /\.pptx$/i.test(resolved) && resolved.length <= 1000 ? resolved : "";
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

module.exports = {
  isolatePptxComponentGroup,
  isolateSlideXmlGroup
};
