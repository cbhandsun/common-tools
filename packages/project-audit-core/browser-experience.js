"use strict";

const { containsControlCharacter } = require("../capability-contracts");

const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { EXPERIENCE_SCENARIOS } = require("./experience-evidence");
const { observeBrowserProcess, waitForBrowserPage } = require("./browser-startup");

const MAX_PLAN_BYTES = 256 * 1024;
const MAX_ACTIONS_PER_SCENARIO = 32;
const MAX_CAPTURE_TIMEOUT_MS = 60 * 1000;
const DEFAULT_CAPTURE_TIMEOUT_MS = 15 * 1000;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const BROWSERS = Object.freeze({
  chrome: Object.freeze(["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")]),
  edge: Object.freeze(["C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"])
});

function loopbackUrl(value, { allowExternalUrl = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new TypeError("experience baseUrl is invalid");
  let url;
  try { url = new URL(value); } catch { throw new TypeError("experience baseUrl is invalid"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new TypeError("experience baseUrl is invalid");
  if (!allowExternalUrl && !LOOPBACK_HOSTS.has(url.hostname)) throw new Error("experience baseUrl must use a loopback host unless --allow-external-url is set");
  return url;
}

function captureOptions({ browser = "chrome", timeoutMs, allowExternalUrl = false } = {}) {
  if (browser !== "chrome" && browser !== "edge") throw new TypeError("browser must be chrome or edge");
  const parsedTimeout = timeoutMs === undefined ? DEFAULT_CAPTURE_TIMEOUT_MS : Number(timeoutMs);
  if (!Number.isSafeInteger(parsedTimeout) || parsedTimeout < 1000 || parsedTimeout > MAX_CAPTURE_TIMEOUT_MS) throw new TypeError("browser timeout must be between 1000 and 60000");
  if (typeof allowExternalUrl !== "boolean") throw new TypeError("allowExternalUrl must be a boolean");
  return Object.freeze({ browser, timeoutMs: parsedTimeout, allowExternalUrl });
}

function readExperiencePlan(projectRoot, source, options = {}) {
  if (typeof source !== "string" || !source.trim()) throw new TypeError("experience plan is required");
  const candidate = insideRoot(projectRoot, path.resolve(projectRoot, source));
  const file = insideRoot(projectRoot, fs.realpathSync.native(candidate));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_PLAN_BYTES) throw new Error("experience plan file is invalid");
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("experience plan file is not valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "baseUrl,scenarios,schemaVersion" || value.schemaVersion !== 1 || !Array.isArray(value.scenarios) || !value.scenarios.length || value.scenarios.length > EXPERIENCE_SCENARIOS.length) throw new Error("experience plan schema is invalid");
  const baseUrl = loopbackUrl(value.baseUrl, options);
  const seen = new Set();
  const scenarios = value.scenarios.map((scenario) => normalizeScenario(scenario, seen));
  return Object.freeze({ schemaVersion: 1, baseUrl: baseUrl.href, scenarios: Object.freeze(scenarios) });
}

function normalizeScenario(value, seen) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "actions,id" || typeof value.id !== "string" || !EXPERIENCE_SCENARIOS.includes(value.id) || seen.has(value.id) || !Array.isArray(value.actions) || !value.actions.length || value.actions.length > MAX_ACTIONS_PER_SCENARIO) throw new Error("experience plan scenario is invalid");
  seen.add(value.id);
  return Object.freeze({ id: value.id, actions: Object.freeze(value.actions.map(normalizeAction)) });
}

function normalizeAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.type !== "string") throw new Error("experience plan action is invalid");
  const keys = Object.keys(value).sort().join(",");
  if (value.type === "navigate") {
    if (keys !== "path,type" || typeof value.path !== "string" || !value.path.startsWith("/") || value.path.startsWith("//") || value.path.length > 1024 || containsControlCharacter(value.path)) throw new Error("experience navigate action is invalid");
    return Object.freeze({ type: "navigate", path: value.path });
  }
  if (value.type === "click" || value.type === "wait-for") {
    if (keys !== "selector,type" || typeof value.selector !== "string" || !value.selector.trim() || value.selector.length > 512 || containsControlCharacter(value.selector)) throw new Error("experience selector action is invalid");
    return Object.freeze({ type: value.type, selector: value.selector.trim() });
  }
  if (value.type === "press") {
    if (keys !== "key,type" || typeof value.key !== "string" || !/^(?:Enter|Escape|Tab|Arrow(?:Up|Down|Left|Right)|Space)$/.test(value.key)) throw new Error("experience key action is invalid");
    return Object.freeze({ type: "press", key: value.key });
  }
  if (value.type === "fill") {
    if (keys !== "selector,type,value" || typeof value.selector !== "string" || !value.selector.trim() || value.selector.length > 512 || typeof value.value !== "string" || value.value.length > 1024 || /(?:password|secret|token|api[_-]?key)/i.test(value.selector)) throw new Error("experience fill action is invalid");
    return Object.freeze({ type: "fill", selector: value.selector.trim(), value: value.value });
  }
  throw new Error("experience plan action is invalid");
}

function resolveBrowser(browser) {
  const candidate = BROWSERS[browser].find((file) => file && fs.existsSync(file) && fs.statSync(file).isFile());
  if (!candidate) throw new Error(`${browser} browser executable is unavailable`);
  return candidate;
}

async function collectBrowserExperience({ projectRoot, planFile, output, browser, timeoutMs, allowExternalUrl = false, processFactory = childProcess.spawn, browserResolver = resolveBrowser, fetchVersion = fetchJson, cdpFactory = createCdpClient } = {}) {
  const options = captureOptions({ browser, timeoutMs, allowExternalUrl });
  const plan = readExperiencePlan(projectRoot, planFile, options);
  const outputRoot = prepareOutput(projectRoot, output);
  const port = await availablePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-audit-browser-"));
  let processHandle;
  let startupMonitor;
  try {
    const executable = browserResolver(options.browser);
    try {
      processHandle = processFactory(executable, [`--headless=new`, "--window-size=1440,900", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch { throw new Error("browser process could not be started"); }
    if (!processHandle || typeof processHandle.kill !== "function") throw new Error("browser process could not be started");
    startupMonitor = observeBrowserProcess(processHandle);
    const page = await waitForBrowserPage(port, options.timeoutMs, fetchVersion, startupMonitor);
    const client = await cdpFactory(page.webSocketDebuggerUrl);
    try {
      const outputRelative = path.relative(fs.realpathSync.native(projectRoot), outputRoot).split(path.sep).join("/");
      const outcomes = await runScenarios(client, plan, outputRoot, outputRelative, options.timeoutMs, options.allowExternalUrl);
      const manifest = { schemaVersion: 1, scenarios: outcomes.map((outcome) => ({ id: outcome.id, status: outcome.status, evidence: outcome.evidence })) };
      const manifestFile = path.join(outputRoot, "experience.json");
      fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      return Object.freeze({ outputRoot, manifestFile, scenarios: Object.freeze(outcomes.map((outcome) => Object.freeze({ id: outcome.id, status: outcome.status }))) });
    } finally { client.close(); }
  } finally {
    try { await terminateBrowserProcess(processHandle); }
    finally {
      startupMonitor?.dispose();
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
  }
}

async function terminateBrowserProcess(processHandle) {
  if (!processHandle) return;
  if (processHandle.exitCode !== null && processHandle.exitCode !== undefined) return;
  const exited = typeof processHandle.once === "function"
    ? new Promise((resolve) => processHandle.once("exit", resolve))
    : null;
  processHandle.kill();
  if (exited) await Promise.race([exited, delay(5000)]);
}

function prepareOutput(projectRoot, output) {
  if (typeof output !== "string" || !output.trim()) throw new TypeError("browser experience output is required");
  const root = insideRoot(projectRoot, path.resolve(projectRoot, output));
  if (fs.existsSync(root)) throw new Error("browser experience output already exists");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return insideRoot(projectRoot, fs.realpathSync.native(root));
}

function availablePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close((error) => error ? reject(error) : resolve(address.port)); }); }); }
function fetchJson(url) { return new Promise((resolve, reject) => { const request = http.get(url, { timeout: 3000 }, (response) => { let body = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { body += chunk; if (body.length > 65536) request.destroy(new Error("browser response is too large")); }); response.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("browser response is invalid")); } }); }); request.on("error", reject); request.on("timeout", () => request.destroy(new Error("browser endpoint timed out"))); }); }

async function runScenarios(client, plan, outputRoot, outputRelative, timeoutMs, allowExternalUrl) {
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
  if (!allowExternalUrl) {
    const baseOrigin = new URL(plan.baseUrl).origin;
    await client.send("Fetch.enable", { patterns: [{ urlPattern: "http://*" }, { urlPattern: "https://*" }] });
    client.on("Fetch.requestPaused", (event) => {
      let requestUrl;
      try { requestUrl = new URL(event?.request?.url); } catch { return; }
      const method = requestUrl.origin === baseOrigin ? "Fetch.continueRequest" : "Fetch.failRequest";
      const params = method === "Fetch.continueRequest" ? { requestId: event.requestId } : { requestId: event.requestId, errorReason: "BlockedByClient" };
      client.send(method, params).catch(() => {});
    });
  }
  const consoleCounts = { error: 0, warning: 0 }; const network = { failed: 0, statusCounts: {} };
  client.on("Runtime.consoleAPICalled", (event) => { if (event?.type === "error") consoleCounts.error += 1; else if (event?.type === "warning") consoleCounts.warning += 1; });
  client.on("Network.loadingFailed", () => { network.failed += 1; });
  client.on("Network.responseReceived", (event) => { const status = event?.response?.status; if (Number.isSafeInteger(status) && status >= 100 && status <= 599) network.statusCounts[status] = (network.statusCounts[status] || 0) + 1; });
  const outcomes = [];
  for (const scenario of plan.scenarios) {
    const before = { errors: consoleCounts.error, warnings: consoleCounts.warning, failed: network.failed, statusCounts: { ...network.statusCounts } };
    // Successful automation proves capture completion, not experience quality.
    // A reviewer must inspect the artifacts before promoting the scenario.
    let status = "not-verified";
    try { for (const action of scenario.actions) await executeAction(client, action, plan.baseUrl, timeoutMs); } catch { status = "failed"; }
    const evidence = await captureScenario(client, outputRoot, outputRelative, scenario.id, before, consoleCounts, network);
    outcomes.push({ id: scenario.id, status, evidence });
  }
  return outcomes;
}

async function executeAction(client, action, baseUrl, timeoutMs) {
  if (action.type === "navigate") { await client.send("Page.navigate", { url: new URL(action.path, baseUrl).href }); await delay(250); return; }
  if (action.type === "wait-for") { await waitForSelector(client, action.selector, timeoutMs); return; }
  if (action.type === "click") return evaluate(client, `(function(){const el=document.querySelector(${JSON.stringify(action.selector)});if(!el)throw new Error('missing');el.click();return true})()`);
  if (action.type === "fill") return evaluate(client, `(function(){const el=document.querySelector(${JSON.stringify(action.selector)});if(!el)throw new Error('missing');el.focus();el.value=${JSON.stringify(action.value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  if (action.type === "press") return client.send("Input.dispatchKeyEvent", { type: "keyDown", key: action.key }).then(() => client.send("Input.dispatchKeyEvent", { type: "keyUp", key: action.key }));
  throw new Error("experience action is invalid");
}
async function waitForSelector(client, selector, timeoutMs) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { try { if (await evaluate(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return; } catch { /* Transient page state is retried until the bounded deadline. */ } await delay(100); } throw new Error("experience selector timed out"); }
async function evaluate(client, expression) { const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result?.exceptionDetails) throw new Error("browser action failed"); return result?.result?.value; }
async function captureScenario(client, outputRoot, outputRelative, id, before, consoleCounts, network) {
  const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
  const png = Buffer.from(screenshot.data, "base64");
  if (!png.length || png.length > MAX_SCREENSHOT_BYTES) throw new Error("browser screenshot is invalid");
  const screenshotFile = `${id}.png`; fs.writeFileSync(path.join(outputRoot, screenshotFile), png, { mode: 0o600, flag: "wx" });
  const consoleFile = `${id}.console.json`; const networkFile = `${id}.network.json`;
  fs.writeFileSync(path.join(outputRoot, consoleFile), `${JSON.stringify({ errors: consoleCounts.error - before.errors, warnings: consoleCounts.warning - before.warnings })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  const statuses = Object.fromEntries(Object.entries(network.statusCounts).map(([status, count]) => [status, count - (before.statusCounts[status] || 0)]).filter(([, count]) => count > 0));
  fs.writeFileSync(path.join(outputRoot, networkFile), `${JSON.stringify({ failedRequests: network.failed - before.failed, statusCounts: statuses })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return [{ kind: "screenshot", file: `${outputRelative}/${screenshotFile}` }, { kind: "console", file: `${outputRelative}/${consoleFile}` }, { kind: "network", file: `${outputRelative}/${networkFile}` }];
}

function createCdpClient(url) { return new Promise((resolve, reject) => { const socket = new WebSocket(url); const pending = new Map(); const listeners = new Map(); let sequence = 0; socket.addEventListener("open", () => resolve(Object.freeze({ send(method, params = {}) { return new Promise((resolveSend, rejectSend) => { const id = ++sequence; pending.set(id, { method, resolve: resolveSend, reject: rejectSend }); socket.send(JSON.stringify({ id, method, params })); }); }, on(method, listener) { const values = listeners.get(method) || []; values.push(listener); listeners.set(method, values); }, close() { for (const value of pending.values()) value.reject(new Error("browser connection closed")); pending.clear(); socket.close(); } }))); socket.addEventListener("error", () => reject(new Error("browser connection failed"))); socket.addEventListener("message", (event) => { let message; try { message = JSON.parse(event.data); } catch { return; } if (message.id) { const pendingValue = pending.get(message.id); if (!pendingValue) return; pending.delete(message.id); if (message.error) pendingValue.reject(new Error(`browser protocol error for ${pendingValue.method}`)); else pendingValue.resolve(message.result); return; } for (const listener of listeners.get(message.method) || []) listener(message.params); }); }); }
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

module.exports = { BROWSERS, EXPERIENCE_SCENARIOS, captureOptions, collectBrowserExperience, createCdpClient, loopbackUrl, readExperiencePlan, resolveBrowser };
