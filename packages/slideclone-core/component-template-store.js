// @ts-check
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { assertNonEmptyString } = require("../capability-contracts");
const { ComponentTemplateCatalog, validateComponentTemplate } = require("./component-template-catalog");

const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024; // 2MB max per template
const MAX_INDEX_ITEMS = 5000;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

/**
 * @typedef {import("./component-template-harvester").ComponentTemplate} ComponentTemplate
 */

/**
 * @typedef {Object} TemplateStoreOptions
 * @property {string} root - Root storage directory (e.g. workspace or state root)
 * @property {string} [subDir] - Subdirectory under root, defaults to "templates/components"
 */

class ComponentTemplateStore {
  /**
   * @param {TemplateStoreOptions} options
   */
  constructor(options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("ComponentTemplateStore options must be an object");
    const requestedRoot = path.resolve(assertNonEmptyString(options.root, "root"));
    fs.mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
    this.root = insideRoot(requestedRoot, requestedRoot);

    const subDir = options.subDir ? assertNonEmptyString(options.subDir, "subDir") : path.join("templates", "components");
    this.storageDir = insideRoot(this.root, path.join(this.root, subDir));
    fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
    this.indexFile = insideRoot(this.storageDir, path.join(this.storageDir, "index.json"));
  }

  /**
   * Resolve template file path safely inside approved storage directory.
   * @param {string} id
   * @returns {string}
   */
  templatePath(id) {
    const safeId = assertNonEmptyString(id, "template id");
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(safeId)) {
      throw new TypeError("template id contains invalid filename characters");
    }
    return insideRoot(this.storageDir, path.join(this.storageDir, `${safeId}.json`));
  }

  /**
   * Save a template to disk atomically and update catalog index.
   * @param {ComponentTemplate} template
   * @returns {{ path: string, sha256: string }}
   */
  save(template) {
    const validated = validateComponentTemplate(template);
    const targetFile = this.templatePath(validated.id);
    const content = JSON.stringify(validated, null, 2);

    if (Buffer.byteLength(content, "utf8") > MAX_TEMPLATE_BYTES) {
      throw new RangeError(`template content exceeds maximum size of ${MAX_TEMPLATE_BYTES} bytes`);
    }

    const sha256 = hashTemplateContent(content);
    const tempFile = `${targetFile}.${process.pid}.${crypto.randomUUID()}.tmp`;

    fs.writeFileSync(tempFile, content, { encoding: "utf8", mode: 0o600 });
    try {
      fs.renameSync(tempFile, targetFile);
    } catch (err) {
      if (fs.existsSync(tempFile)) fs.rmSync(tempFile, { force: true });
      throw err;
    }

    this._updateIndex(validated, sha256);
    return Object.freeze({ path: targetFile, sha256 });
  }

  /**
   * Load a single template by ID.
   * @param {string} id
   * @returns {ComponentTemplate | null}
   */
  load(id) {
    const file = this.templatePath(id);
    if (!fs.existsSync(file)) return null;

    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEMPLATE_BYTES) {
      throw new Error("template file is invalid or oversized");
    }

    const content = fs.readFileSync(file, "utf8");
    const expected = this._indexEntryForId(id);
    if (expected && hashTemplateContent(content) !== expected.sha256) {
      throw new Error("template file checksum mismatch");
    }
    const raw = JSON.parse(content);
    return validateComponentTemplate(raw);
  }

  /**
   * List all stored templates from index or filesystem.
   * @returns {ReadonlyArray<{ id: string, archetype: string, category: string, sha256: string, updatedAt: string }>}
   */
  list() {
    const index = this._readVerifiedIndex({ clean: true });
    return Object.freeze([...index]);
  }

  /**
   * Delete a template from disk and update index.
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const file = this.templatePath(id);
    if (!fs.existsSync(file)) {
      this._removeFromIndex(id);
      return false;
    }

    fs.rmSync(file, { force: true });
    this._removeFromIndex(id);
    return true;
  }

  /**
   * Hydrate a full ComponentTemplateCatalog with all persistent templates and built-ins.
   * @param {{ includeBuiltins?: boolean }} [options]
   * @returns {InstanceType<typeof ComponentTemplateCatalog>}
   */
  loadCatalog(options = {}) {
    const catalog = new ComponentTemplateCatalog(options);
    const index = this._readIndex();

    for (const item of index) {
      try {
        const tpl = this.load(item.id);
        if (tpl && !catalog.get(tpl.id)) {
          catalog.register(tpl);
        }
      } catch {
        // Skip corrupted templates cleanly
      }
    }
    return catalog;
  }

  /**
   * @private
   * @returns {Array<{ id: string, archetype: string, category: string, sha256: string, updatedAt: string }>}
   */
  _readIndex() {
    if (!fs.existsSync(this.indexFile)) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(this.indexFile, "utf8"));
      if (Array.isArray(raw)) return sanitizeIndex(raw);
    } catch {
      // Fallback on corrupt index
    }
    return [];
  }

  /**
   * @private
   * @param {{ clean?: boolean }} [options]
   * @returns {Array<{ id: string, archetype: string, category: string, sha256: string, updatedAt: string }>}
   */
  _readVerifiedIndex(options = {}) {
    const raw = this._readRawIndexItems();
    const verified = [];
    const seen = new Set();
    for (const item of raw) {
      if (verified.length >= MAX_INDEX_ITEMS) break;
      const entry = sanitizeIndexEntry(item);
      if (!entry || seen.has(entry.id) || !this._indexEntryHasValidFile(entry)) continue;
      seen.add(entry.id);
      verified.push(entry);
    }
    if (options.clean === true && JSON.stringify(verified) !== JSON.stringify(sanitizeIndex(raw))) this._writeIndex(verified);
    return verified;
  }

  /**
   * @private
   * @returns {unknown[]}
   */
  _readRawIndexItems() {
    if (!fs.existsSync(this.indexFile)) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(this.indexFile, "utf8"));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  /**
   * @private
   * @param {{ id: string, sha256: string }} entry
   * @returns {boolean}
   */
  _indexEntryHasValidFile(entry) {
    let file;
    try {
      file = this.templatePath(entry.id);
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEMPLATE_BYTES) return false;
      return hashTemplateContent(fs.readFileSync(file, "utf8")) === entry.sha256;
    } catch {
      return false;
    }
  }

  /**
   * @private
   * @param {string} id
   * @returns {{ id: string, archetype: string, category: string, sha256: string, updatedAt: string } | null}
   */
  _indexEntryForId(id) {
    const safeId = assertNonEmptyString(id, "template id").trim();
    return this._readIndex().find((entry) => entry.id === safeId) || null;
  }

  /**
   * @private
   * @param {ComponentTemplate} template
   * @param {string} sha256
   */
  _updateIndex(template, sha256) {
    const index = this._readIndex().filter((entry) => entry.id !== template.id);
    index.push({
      id: template.id,
      archetype: template.archetype,
      category: template.category,
      sha256,
      updatedAt: new Date().toISOString()
    });
    this._writeIndex(index);
  }

  /**
   * @private
   * @param {string} id
   */
  _removeFromIndex(id) {
    const index = this._readIndex().filter((entry) => entry.id !== id);
    this._writeIndex(index);
  }

  /**
   * @private
   * @param {Array<{ id: string, archetype: string, category: string, sha256: string, updatedAt: string }>} index
   */
  _writeIndex(index) {
    const content = JSON.stringify(sanitizeIndex(index), null, 2);
    const tempFile = `${this.indexFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempFile, content, { encoding: "utf8", mode: 0o600 });
    try {
      fs.renameSync(tempFile, this.indexFile);
    } catch (err) {
      if (fs.existsSync(tempFile)) fs.rmSync(tempFile, { force: true });
      throw err;
    }
  }
}

/**
 * @param {string} content
 * @returns {string}
 */
function hashTemplateContent(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * @param {unknown[]} raw
 * @returns {Array<{ id: string, archetype: string, category: string, sha256: string, updatedAt: string }>}
 */
function sanitizeIndex(raw) {
  const result = [];
  const seen = new Set();
  for (const item of raw) {
    if (result.length >= MAX_INDEX_ITEMS) break;
    const entry = sanitizeIndexEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

/**
 * @param {unknown} value
 * @returns {{ id: string, archetype: string, category: string, sha256: string, updatedAt: string } | null}
 */
function sanitizeIndexEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const id = singleLine(raw.id, 128);
  if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
  const archetype = singleLine(raw.archetype, 128);
  const category = singleLine(raw.category, 128);
  const sha256 = singleLine(raw.sha256, 64);
  const updatedAt = singleLine(raw.updatedAt, 64);
  if (!archetype || !category || !sha256 || !SHA256_HEX_RE.test(sha256) || !updatedAt || Number.isNaN(Date.parse(updatedAt))) return null;
  return { id, archetype, category, sha256, updatedAt };
}

/**
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string | null}
 */
function singleLine(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > maxLength || /[\r\n\0]/u.test(text)) return null;
  return text;
}

/**
 * Create a new ComponentTemplateStore.
 * @param {TemplateStoreOptions} options
 * @returns {InstanceType<typeof ComponentTemplateStore>}
 */
function createTemplateStore(options) {
  return new ComponentTemplateStore(options);
}

module.exports = {
  ComponentTemplateStore,
  createTemplateStore,
  hashTemplateContent,
  sanitizeIndex,
  sanitizeIndexEntry
};
