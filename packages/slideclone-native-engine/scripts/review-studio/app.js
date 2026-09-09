"use strict";

const state = { token: "", revision: "", deck: null, pageIndex: 0, selected: null, pending: new Map(), drag: null };
const elements = {
  pageSelect: document.getElementById("page-select"), apply: document.getElementById("apply"), stage: document.getElementById("stage"),
  source: document.getElementById("source"), overlay: document.getElementById("overlay"), status: document.getElementById("status"),
  form: document.getElementById("inspector"), title: document.getElementById("selected-title"), kind: document.getElementById("selected-kind"),
  geometry: document.getElementById("geometry-fields"), text: document.getElementById("text-fields"), style: document.getElementById("style-fields"), review: document.getElementById("review-fields")
};

start().catch(() => setStatus("载入失败，请检查终端输出与 IR 文件。", true));

async function start() {
  const response = await fetch("/api/deck", { cache: "no-store" });
  if (!response.ok) throw new Error("deck request failed");
  const payload = await response.json();
  state.token = payload.token;
  state.revision = payload.revision;
  state.deck = payload.deck;
  state.pageIndex = state.deck.pages[0]?.pageIndex ?? 0;
  buildPageSelect();
  bindEvents();
  renderPage();
  setStatus("选择图层后，可拖动或在右侧精确修改。修改仅在点击“应用补丁”后写入。", false);
}

function bindEvents() {
  elements.pageSelect.addEventListener("change", () => { state.pageIndex = Number(elements.pageSelect.value); state.selected = null; renderPage(); });
  elements.apply.addEventListener("click", applyPending);
  elements.form.addEventListener("change", inspectorChanged);
  window.addEventListener("pointermove", dragMove);
  window.addEventListener("pointerup", () => { state.drag = null; });
}

function buildPageSelect() {
  elements.pageSelect.replaceChildren();
  for (const page of state.deck.pages) {
    const option = document.createElement("option");
    option.value = String(page.pageIndex);
    option.textContent = `P${page.pageIndex + 1}`;
    elements.pageSelect.append(option);
  }
}

function renderPage() {
  const page = currentPage();
  if (!page) return;
  const ratio = state.deck.slideSize.heightPt / state.deck.slideSize.widthPt;
  elements.stage.style.aspectRatio = `${state.deck.slideSize.widthPt} / ${state.deck.slideSize.heightPt}`;
  elements.source.src = `${page.sourceUrl}?v=${Date.now()}`;
  elements.overlay.replaceChildren();
  page.elements.forEach((item, index) => {
    const layer = document.createElement("button");
    layer.type = "button";
    layer.className = "layer";
    layer.dataset.id = item.id;
    layer.dataset.collection = item.collection;
    layer.dataset.label = `${item.collection} · ${item.id}`;
    layer.setAttribute("aria-label", layer.dataset.label);
    layer.style.zIndex = String(index + 1);
    placeLayer(layer, item.box);
    if (state.selected?.id === item.id && state.selected?.collection === item.collection) layer.classList.add("selected");
    layer.addEventListener("click", (event) => { event.stopPropagation(); selectItem(item); });
    layer.addEventListener("pointerdown", (event) => beginDrag(event, item));
    elements.overlay.append(layer);
  });
  elements.stage.style.minHeight = `min(70vh, ${Math.round(1100 * ratio)}px)`;
  refreshInspector();
}

function placeLayer(layer, box) {
  const size = state.deck.slideSize;
  layer.style.left = `${box.x / size.widthPt * 100}%`;
  layer.style.top = `${box.y / size.heightPt * 100}%`;
  layer.style.width = `${box.w / size.widthPt * 100}%`;
  layer.style.height = `${box.h / size.heightPt * 100}%`;
}

function selectItem(item) { state.selected = item; renderPage(); }

function refreshInspector() {
  const item = state.selected;
  for (const fieldset of [elements.geometry, elements.text, elements.style, elements.review]) fieldset.disabled = !item;
  elements.text.hidden = !item || item.collection !== "textBoxes";
  if (!item) { elements.title.textContent = "未选择"; elements.kind.textContent = ""; elements.form.reset(); return; }
  elements.title.textContent = item.id;
  elements.kind.textContent = item.collection;
  setValue("x", item.box.x); setValue("y", item.box.y); setValue("w", item.box.w); setValue("h", item.box.h);
  setValue("text", item.text ?? ""); setValue("family", item.font?.family ?? ""); setValue("sizePt", item.font?.sizePt ?? "");
  setValue("fontColor", item.font?.color ?? ""); setValue("align", item.font?.align ?? "left");
  setValue("fill", item.style?.fill ?? ""); setValue("stroke", item.style?.stroke ?? ""); setValue("strokeWidthPt", item.style?.strokeWidthPt ?? ""); setValue("opacity", item.style?.opacity ?? "");
  setValue("reviewStatus", item.review?.status ?? "open"); setValue("reviewNote", item.review?.note ?? "");
}

function inspectorChanged(event) {
  if (!state.selected || !event.target.name) return;
  const name = event.target.name;
  if (["x", "y", "w", "h"].includes(name)) queueChange("box", name, Number(event.target.value));
  else if (name === "text") queueTopLevel("text", event.target.value);
  else if (["family", "sizePt", "fontColor", "align"].includes(name)) queueChange("font", name === "fontColor" ? "color" : name, name === "sizePt" ? Number(event.target.value) : event.target.value);
  else if (["fill", "stroke", "strokeWidthPt", "opacity"].includes(name)) queueChange("style", name, ["strokeWidthPt", "opacity"].includes(name) ? Number(event.target.value) : event.target.value);
  else if (name === "reviewStatus") queueChange("review", "status", event.target.value);
  else if (name === "reviewNote") queueChange("review", "note", event.target.value);
  renderPage();
}

function beginDrag(event, item) {
  event.preventDefault();
  selectItem(item);
  state.drag = { x: event.clientX, y: event.clientY, startX: item.box.x, startY: item.box.y };
}

function dragMove(event) {
  if (!state.drag || !state.selected) return;
  const rect = elements.stage.getBoundingClientRect();
  const x = state.drag.startX + (event.clientX - state.drag.x) / rect.width * state.deck.slideSize.widthPt;
  const y = state.drag.startY + (event.clientY - state.drag.y) / rect.height * state.deck.slideSize.heightPt;
  queueChange("box", "x", round2(x)); queueChange("box", "y", round2(y));
  const layer = elements.overlay.querySelector(`[data-id="${cssEscape(state.selected.id)}"][data-collection="${cssEscape(state.selected.collection)}"]`);
  if (layer) placeLayer(layer, state.selected.box);
  setValue("x", state.selected.box.x); setValue("y", state.selected.box.y);
}

function queueTopLevel(field, value) {
  const patch = pendingPatch();
  patch.changes[field] = value;
  state.selected[field] = value;
  updateApplyState();
}

function queueChange(group, field, value) {
  const patch = pendingPatch();
  patch.changes[group] = patch.changes[group] || {};
  patch.changes[group][field] = value;
  state.selected[group] = state.selected[group] || {};
  state.selected[group][field] = value;
  updateApplyState();
}

function pendingPatch() {
  const key = `${state.pageIndex}\u0000${state.selected.collection}\u0000${state.selected.id}`;
  if (!state.pending.has(key)) state.pending.set(key, { operationId: randomId(), pageIndex: state.pageIndex, collection: state.selected.collection, elementId: state.selected.id, changes: {} });
  return state.pending.get(key);
}

async function applyPending() {
  if (state.pending.size === 0) return;
  elements.apply.disabled = true;
  setStatus("正在验证并写入补丁…", false);
  try {
    const response = await fetch("/api/apply", { method: "POST", headers: { "Content-Type": "application/json", "X-Review-Token": state.token }, body: JSON.stringify({ revision: state.revision, patches: [...state.pending.values()] }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "apply failed");
    state.revision = payload.receipt.afterSha256;
    state.deck = payload.deck;
    state.pending.clear(); state.selected = null;
    renderPage();
    setStatus(`已应用 ${payload.applied} 个补丁，并创建备份。`, false);
  } catch (error) { setStatus(`应用失败：${String(error.message || error).slice(0, 240)}`, true); updateApplyState(); }
}

function currentPage() { return state.deck.pages.find((page) => page.pageIndex === state.pageIndex); }
function setValue(name, value) { const input = elements.form.elements.namedItem(name); if (input) input.value = value; }
function updateApplyState() { elements.apply.disabled = state.pending.size === 0; }
function setStatus(message, error) { elements.status.textContent = message; elements.status.style.color = error ? "#ff7b72" : "#8b949e"; }
function round2(value) { return Math.round(value * 100) / 100; }
function randomId() { return globalThis.crypto?.randomUUID?.() || `review-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : value.replace(/[^A-Za-z0-9_-]/g, "_"); }
