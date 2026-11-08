"use strict";
// Shared deterministic raster fixtures; test assertions remain in the suite.
function blankImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  const rgb = parseHex(color);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = rgb[0];
    rgba[index * 4 + 1] = rgb[1];
    rgba[index * 4 + 2] = rgb[2];
    rgba[index * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function fillRect(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillEllipse(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = (xx + 0.5 - cx) / rx;
      const dy = (yy + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillPill(image, x, y, w, h, color) {
  fillRect(image, x + h / 2, y, w - h, h, color);
  fillEllipse(image, x, y, h, h, color);
  fillEllipse(image, x + w - h, y, h, h, color);
}

function fillDiamond(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = Math.abs(xx + 0.5 - cx) / rx;
      const dy = Math.abs(yy + 0.5 - cy) / ry;
      if (dx + dy > 1) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillTriangleUp(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    const progress = (yy - y) / Math.max(1, h - 1);
    const halfWidth = progress * w / 2;
    for (let xx = x; xx < x + w; xx += 1) {
      if (Math.abs(xx + 0.5 - cx) > halfWidth) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillChevronRight(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const points = [
    { x, y },
    { x: x + w * 0.72, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w * 0.72, y: y + h },
    { x, y: y + h },
    { x: x + w * 0.28, y: y + h / 2 }
  ];
  fillPolygon(image, points, rgb);
}

function fillParallelogramRight(image, x, y, w, h, shift, color) {
  const rgb = parseHex(color);
  const points = [
    { x, y },
    { x: x + w - shift, y },
    { x: x + w, y: y + h },
    { x: x + shift, y: y + h }
  ];
  fillPolygon(image, points, rgb);
}

function fillCylinder(image, x, y, w, h, color) {
  const capH = Math.round(h * 0.24);
  const bodyY = y + Math.round(h * 0.12);
  const bodyH = Math.round(h * 0.76);
  fillRect(image, x, bodyY, w, bodyH, color);
  fillEllipse(image, x, y, w, capH, color);
  fillEllipse(image, x, y + h - capH, w, capH, color);
}

function fillCloud(image, x, y, w, h, color) {
  fillEllipse(image, x + Math.round(w * 0.02), y + Math.round(h * 0.36), Math.round(w * 0.42), Math.round(h * 0.48), color);
  fillEllipse(image, x + Math.round(w * 0.24), y + Math.round(h * 0.08), Math.round(w * 0.42), Math.round(h * 0.5), color);
  fillEllipse(image, x + Math.round(w * 0.52), y + Math.round(h * 0.24), Math.round(w * 0.42), Math.round(h * 0.54), color);
  fillEllipse(image, x + Math.round(w * 0.22), y + Math.round(h * 0.38), Math.round(w * 0.56), Math.round(h * 0.44), color);
  fillRect(image, x + Math.round(w * 0.18), y + Math.round(h * 0.48), Math.round(w * 0.62), Math.round(h * 0.24), color);
}

function fillDocument(image, x, y, w, h, wave, color) {
  const rgb = parseHex(color);
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const phase = (xx - x) / Math.max(1, w - 1);
      const bottom = y + h - wave * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
      if (yy > bottom) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillFolder(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  fillPolygon(image, [
    { x, y: y + h * 0.18 },
    { x, y: y + h * 0.08 },
    { x: x + w * 0.34, y: y + h * 0.08 },
    { x: x + w * 0.42, y: y + h * 0.18 },
    { x: x + w, y: y + h * 0.18 },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ], rgb);
}

function fillScreen(image, x, y, w, h, color) {
  const panelH = Math.round(h * 0.68);
  const neckW = Math.round(w * 0.18);
  const neckH = Math.round(h * 0.16);
  const baseW = Math.round(w * 0.52);
  const baseH = Math.round(h * 0.12);
  fillRect(image, x, y, w, panelH, color);
  fillRect(image, x + Math.round((w - neckW) / 2), y + panelH, neckW, neckH, color);
  fillRect(image, x + Math.round((w - baseW) / 2), y + panelH + neckH, baseW, baseH, color);
}

function fillPhone(image, x, y, w, h, color) {
  const radius = Math.round(w * 0.22);
  fillRect(image, x, y + radius, w, h - radius * 2, color);
  fillRect(image, x + radius, y, w - radius * 2, h, color);
  fillEllipse(image, x, y, radius * 2, radius * 2, color);
  fillEllipse(image, x + w - radius * 2, y, radius * 2, radius * 2, color);
  fillEllipse(image, x, y + h - radius * 2, radius * 2, radius * 2, color);
  fillEllipse(image, x + w - radius * 2, y + h - radius * 2, radius * 2, radius * 2, color);
}

function fillFunnel(image, x, y, w, h, color) {
  const stemW = Math.round(w * 0.22);
  const neckY = y + Math.round(h * 0.58);
  for (let yy = y; yy < y + h; yy += 1) {
    const progress = yy < neckY ? (yy - y) / Math.max(1, neckY - y) : 1;
    const rowW = yy < neckY
      ? Math.round(w - (w - stemW) * progress)
      : stemW;
    fillRect(image, x + Math.round((w - rowW) / 2), yy, rowW, 1, color);
  }
}

function fillDonut(image, x, y, w, h, innerRatio, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const innerRx = rx * innerRatio;
  const innerRy = ry * innerRatio;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const outerDx = (xx + 0.5 - cx) / rx;
      const outerDy = (yy + 0.5 - cy) / ry;
      const innerDx = (xx + 0.5 - cx) / innerRx;
      const innerDy = (yy + 0.5 - cy) / innerRy;
      const inOuter = outerDx * outerDx + outerDy * outerDy <= 1;
      const inInner = innerDx * innerDx + innerDy * innerDy < 1;
      if (!inOuter || inInner) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillThickLine(image, x1, y1, x2, y2, width, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length * width / 2;
  const ny = dx / length * width / 2;
  fillPolygon(image, [
    { x: x1 + nx, y: y1 + ny },
    { x: x1 - nx, y: y1 - ny },
    { x: x2 - nx, y: y2 - ny },
    { x: x2 + nx, y: y2 + ny }
  ], parseHex(color));
}

function fillDonutSegment(image, x, y, w, h, innerRatio, startDeg, endDeg, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const innerRx = rx * innerRatio;
  const innerRy = ry * innerRatio;
  const start = normalizeDegrees(startDeg);
  const end = normalizeDegrees(endDeg);
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const px = xx + 0.5;
      const py = yy + 0.5;
      const outerDx = (px - cx) / rx;
      const outerDy = (py - cy) / ry;
      const innerDx = (px - cx) / innerRx;
      const innerDy = (py - cy) / innerRy;
      const inOuter = outerDx * outerDx + outerDy * outerDy <= 1;
      const inInner = innerDx * innerDx + innerDy * innerDy < 1;
      if (!inOuter || inInner) continue;
      const angle = normalizeDegrees(Math.atan2(py - cy, px - cx) * 180 / Math.PI);
      if (!angleInRange(angle, start, end)) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function normalizeDegrees(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}

function angleInRange(angle, start, end) {
  return start <= end ? angle >= start && angle <= end : angle >= start || angle <= end;
}

function fillTriangle(image, points, color) {
  const rgb = parseHex(color);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(image.width - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(image.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInTriangle(x + 0.5, y + 0.5, points[0], points[1], points[2])) continue;
      const offset = (y * image.width + x) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function pointInTriangle(x, y, a, b, c) {
  const area = triangleArea(a, b, c);
  const area1 = triangleArea({ x, y }, b, c);
  const area2 = triangleArea(a, { x, y }, c);
  const area3 = triangleArea(a, b, { x, y });
  return Math.abs(area - area1 - area2 - area3) <= 0.6;
}

function triangleArea(a, b, c) {
  return Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);
}

function fillGear(image, x, y, size, color) {
  const rgb = parseHex(color);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const outer = size * 0.38;
  const inner = size * 0.2;
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    const tx = cx + Math.cos(angle) * size * 0.36;
    const ty = cy + Math.sin(angle) * size * 0.36;
    const toothW = size * 0.14;
    const toothH = size * 0.24;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const corners = [
      { x: -toothW / 2, y: -toothH / 2 },
      { x: toothW / 2, y: -toothH / 2 },
      { x: toothW / 2, y: toothH / 2 },
      { x: -toothW / 2, y: toothH / 2 }
    ].map((point) => ({
      x: tx + point.x * cos - point.y * sin,
      y: ty + point.x * sin + point.y * cos
    }));
    fillPolygon(image, corners, rgb);
  }
  for (let yy = y; yy < y + size; yy += 1) {
    for (let xx = x; xx < x + size; xx += 1) {
      const radius = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
      if (radius > outer || radius < inner) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillMagnifier(image, x, y, size, color) {
  const rgb = parseHex(color);
  const lens = Math.round(size * 0.68);
  fillDonut(image, x, y, lens, lens, 0.58, color);
  const handleW = size * 0.12;
  const start = { x: x + lens * 0.68, y: y + lens * 0.68 };
  const end = { x: x + size * 0.94, y: y + size * 0.94 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len * handleW / 2;
  const ny = dx / len * handleW / 2;
  fillPolygon(image, [
    { x: start.x + nx, y: start.y + ny },
    { x: start.x - nx, y: start.y - ny },
    { x: end.x - nx, y: end.y - ny },
    { x: end.x + nx, y: end.y + ny }
  ], rgb);
}

function fillShield(image, x, y, w, h, color) {
  fillPolygon(image, [
    { x: x + w * 0.5, y },
    { x: x + w * 0.92, y: y + h * 0.15 },
    { x: x + w * 0.86, y: y + h * 0.56 },
    { x: x + w * 0.72, y: y + h * 0.80 },
    { x: x + w * 0.5, y: y + h },
    { x: x + w * 0.28, y: y + h * 0.80 },
    { x: x + w * 0.14, y: y + h * 0.56 },
    { x: x + w * 0.08, y: y + h * 0.15 }
  ], parseHex(color));
}

function fillCycleArrow(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const outer = Math.min(w, h) * 0.48;
  const inner = Math.min(w, h) * 0.29;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = xx + 0.5 - cx;
      const dy = yy + 0.5 - cy;
      const radius = Math.hypot(dx, dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      const inArc = radius >= inner && radius <= outer && angle >= 34 && angle <= 330;
      if (!inArc) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
  fillPolygon(image, [
    { x: x + w * 0.88, y: y + h * 0.28 },
    { x: x + w * 0.62, y: y + h * 0.18 },
    { x: x + w * 0.72, y: y + h * 0.45 }
  ], rgb);
}

function fillPerson(image, x, y, w, h, color) {
  const head = Math.round(w * 0.48);
  fillEllipse(image, x + Math.round((w - head) / 2), y, head, head, color);
  const bodyY = y + Math.round(head * 0.74);
  const bodyH = y + h - bodyY;
  const radius = Math.round(w * 0.18);
  fillRect(image, x + radius, bodyY, w - radius * 2, bodyH, color);
  fillRect(image, x, bodyY + radius, w, bodyH - radius, color);
  fillEllipse(image, x, bodyY, radius * 2, radius * 2, color);
  fillEllipse(image, x + w - radius * 2, bodyY, radius * 2, radius * 2, color);
}

function fillTeam(image, x, y, w, h, color) {
  const sideW = Math.round(w * 0.36);
  const sideH = Math.round(h * 0.78);
  const centerW = Math.round(w * 0.42);
  const centerH = Math.round(h * 0.9);
  fillPerson(image, x, y + Math.round(h * 0.14), sideW, sideH, color);
  fillPerson(image, x + w - sideW, y + Math.round(h * 0.14), sideW, sideH, color);
  fillPerson(image, x + Math.round((w - centerW) / 2), y, centerW, centerH, color);
}

function fillTimeline(image, x, y, w, h, milestoneRatios, color) {
  const lineY = y + Math.round(h / 2);
  fillRect(image, x, lineY - 2, w, 4, color);
  for (const ratio of milestoneRatios) {
    const size = Math.round(h * 0.72);
    const cx = x + Math.round(w * ratio);
    fillEllipse(image, cx - Math.round(size / 2), lineY - Math.round(size / 2), size, size, color);
  }
}

function fillPolygon(image, points, rgb) {
  const minX = Math.floor(Math.min(...points.map((point) => point.x)));
  const maxX = Math.ceil(Math.max(...points.map((point) => point.x)));
  const minY = Math.floor(Math.min(...points.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...points.map((point) => point.y)));
  for (let yy = minY; yy <= maxY; yy += 1) {
    for (let xx = minX; xx <= maxX; xx += 1) {
      if (!pointInPolygon(xx + 0.5, yy + 0.5, points)) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillSankeyBand(image, x0, sourceTop, sourceBottom, x1, targetTop, targetBottom, color) {
  const points = [];
  const steps = 32;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    points.push({ x: x0 + (x1 - x0) * t, y: cubicEase(sourceTop, targetTop, t) });
  }
  for (let index = steps; index >= 0; index -= 1) {
    const t = index / steps;
    points.push({ x: x0 + (x1 - x0) * t, y: cubicEase(sourceBottom, targetBottom, t) });
  }
  fillPolygon(image, points, parseHex(color));
}

function cubicEase(start, end, t) {
  const smooth = t * t * (3 - 2 * t);
  return start + (end - start) * smooth;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const pi = points[i];
    const pj = points[j];
    const denominator = pj.y - pi.y || 0.0001;
    const intersects = ((pi.y > y) !== (pj.y > y))
      && x < (pj.x - pi.x) * (y - pi.y) / denominator + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function fillArrowRight(image, x, y, shaftW, shaftH, headW, color) {
  fillRect(image, x, y, shaftW, shaftH, color);
  const rgb = parseHex(color);
  const centerY = y + shaftH / 2;
  const headH = shaftH * 2.8;
  for (let yy = Math.floor(centerY - headH / 2); yy <= Math.ceil(centerY + headH / 2); yy += 1) {
    for (let xx = x + shaftW; xx < x + shaftW + headW; xx += 1) {
      const progress = (xx - (x + shaftW)) / Math.max(1, headW);
      const halfHeight = (1 - progress) * headH / 2;
      if (Math.abs(yy + 0.5 - centerY) > halfHeight) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillLine(image, x1, y1, x2, y2, thickness, color) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1;
  let y = y1;
  const radius = Math.max(0, Math.floor(thickness / 2));
  while (true) {
    fillRect(image, x - radius, y - radius, radius * 2 + 1, radius * 2 + 1, color);
    if (x === x2 && y === y2) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function parseHex(hex) {
  const value = String(hex).replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

module.exports={blankImage,fillRect,fillEllipse,fillPill,fillDiamond,fillTriangleUp,fillChevronRight,fillParallelogramRight,fillCylinder,fillCloud,fillDocument,fillFolder,fillScreen,fillPhone,fillFunnel,fillDonut,fillThickLine,fillDonutSegment,fillTriangle,fillGear,fillMagnifier,fillShield,fillCycleArrow,fillPerson,fillTeam,fillTimeline,fillPolygon,fillSankeyBand,fillArrowRight,fillLine,parseHex};
