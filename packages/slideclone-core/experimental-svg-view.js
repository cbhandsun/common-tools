"use strict";

function createSvgSceneView(document, api, measureInk, paragraphLayout) {
  const ns = "http://www.w3.org/2000/svg";
  function element(name, attrs = {}) {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }
  function draw(svg, scene) {
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
    svg.setAttribute("width", scene.width * 1.8);
    svg.setAttribute("height", scene.height * 1.8);
    svg.append(element("rect", { width: scene.width, height: scene.height, fill: scene.background }));
    const textNodes = [];
    for (const o of scene.objects) {
      const group = element("g", { "data-object-id": o.id, "data-kind": o.kind, tabindex: "0", role: "button", "aria-label": o.kind === "text" ? `文字：${o.text}` : `图形：${o.id}` });
      if (o.kind === "text") {
        if (o.rotation) group.setAttribute("transform", `rotate(${o.rotation} ${o.box.x + o.box.w / 2} ${o.box.y + o.box.h / 2})`);
        if (o.paragraph) {
          if (typeof paragraphLayout !== "function" || typeof measureInk !== "function") throw new Error("Paragraph measurement unavailable");
          const layout=paragraphLayout({text:o.text,font:o.runs[0].font,box:o.box,runs:o.runs},measureInk);
          group.setAttribute("data-text-overflow",String(layout.overflow));
          for(const line of layout.lines){
            const text=element("text",{x:line.x,y:line.y+o.runs[0].font.sizePt,"xml:space":"preserve",stroke:o.outline,"stroke-width":o.outlineWidth,"paint-order":"stroke fill"});
            for(const run of line.fragments){const span=element("tspan",{"font-family":`"${run.font.family}"`,"font-size":run.font.sizePt,"font-weight":run.font.weight,fill:run.font.color});span.textContent=run.text;text.append(span);}
            group.append(text);
          }
        } else for (const r of o.runs) {
          const text = element("text", { x: 0, y: 0, "font-family": `"${r.font.family}"`, "font-size": r.font.sizePt, "font-weight": r.font.weight, fill: r.font.color, stroke: o.outline, "stroke-width": o.outlineWidth, "paint-order": "stroke fill", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke", "xml:space": "preserve" });
          text.textContent = r.text;
          group.append(text); textNodes.push({ text, r, fit: o.fit, flow: o.flow });
        }
      } else if (o.kind === "freeform") {
        group.append(element("path", { d: api.pathData(o), fill: o.fill, stroke: o.stroke, "stroke-width": o.strokeWidth, "stroke-dasharray": o.dash === "dash" ? `${o.strokeWidth * 4} ${o.strokeWidth * 3}` : "none", "stroke-linejoin": "round" }));
      } else {
        const [a, b] = api.endpoints(scene, o);
        group.append(element("path", { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, fill: "none", stroke: o.stroke, "stroke-width": o.strokeWidth }));
      }
      if (o.kind !== "text") for (const arrow of api.arrowPaths(scene, o)) group.append(element("path", { d: arrow.d, fill: o.stroke, "data-arrow-end": arrow.end }));
      svg.append(group);
    }
    // SVG text remains Unicode text. Only its visual transform uses the observed ink frame.
    for (const { text, r, fit, flow } of textNodes) {
      if (!r.text.trim()) continue;
      const ink = flow && measureInk ? measureInk(r.text, r.font) : text.getBBox(), b = r.box;
      if (ink.width <= 0 || ink.height <= 0) throw new Error("Text measurement failed");
      const sx = fit ? b.w / ink.width : 1, sy = fit ? b.h / ink.height : 1;
      text.setAttribute("transform", `translate(${b.x - ink.x * sx} ${b.y + (fit ? 0 : (b.h - ink.height) / 2) - ink.y * sy}) scale(${sx} ${sy})`);
    }
    return { objects: scene.objects.length, textObjects: scene.objects.filter(o => o.kind === "text").length, textRuns: textNodes.length, imageObjects: svg.querySelectorAll("image").length };
  }
  return { draw };
}

if (typeof module !== "undefined") module.exports = { createSvgSceneView };
