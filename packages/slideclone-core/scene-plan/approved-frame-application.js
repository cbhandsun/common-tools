// @ts-check
"use strict";
const path = require("node:path");
const { readPngBuffer } = require("../png");
const { createApprovedApproxFrameDrawSession } = require("./approved-frame-draw");
const { record, list, absolutePath, snapshot, fingerprint, parseReview } = require("./approved-frame-application-input");
const { digest, readFile, assetFile, workspace, removeStaging, createStaging, writeAsset } = require("./approved-frame-application-files");
const { issueApprovedFrameApplication } = require("./approved-frame-application-lifecycle");
const {approvedCardBackdropOption,prepareApprovedCardBackdrop}=require('./approved-card-backdrop');
const {approvedRouteApproximationOption,prepareApprovedRouteApproximation}=require('./approved-route-approximation');
const {parseConnectorCornerMode}=require('../routing/source-route-corner-mode');
const {selectApprovedFrameRetirements}=require('./approved-frame-retirement-selection');
const {parseApprovedCardTextAncestors}=require('./approved-card-text-ancestors');
const {publishApprovedFrameCompletion}=require('./approved-frame-completion');

/** @param {Record<string,unknown>} object @param {string} key */
function writable(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor ? descriptor.writable !== true : !Object.isExtensible(object)) throw new TypeError("approved-frame-output-readonly");
}
/** @param {unknown} check */
async function cancellation(check) {
  if (typeof check !== "function") throw new TypeError("invalid-approved-frame-cancellation");
  let result;
  try { result = await check(); } catch { throw new Error("approved-frame-cancellation-unavailable"); }
  if (typeof result !== "boolean") throw new TypeError("invalid-approved-frame-cancellation");
  if (result) throw new Error("editable job was cancelled");
}
/** The host constructs this dependency only after approval of the exact review
 * bundle. A job option or serialized approvalId never installs the service.
 * Reviewed after-assets are re-read/hash-checked; this stage grants no strict
 * source authority and does not derive paint from an unverified public flag.
 * @param {unknown} input @param {unknown} [options] */
function createApprovedFrameAssetApplication(input,options) {
  const review = parseReview(input), reviewFingerprint = fingerprint(review);
  const optionData=options===undefined?undefined:record(options);
  if(optionData&&Object.keys(optionData).some(k=>!['cardBackdrop','nativeRoute','frameRegionIds','retirementIds','cardTextAncestors'].includes(k)))throw new TypeError('approved-card-backdrop-option-invalid');
  const paintOptions=optionData===undefined?undefined:Object.fromEntries(Object.entries(optionData).filter(([key])=>!['frameRegionIds','retirementIds','cardTextAncestors'].includes(key)));
  const cardPolicy=approvedCardBackdropOption(paintOptions,review.source);
  const textAncestors=parseApprovedCardTextAncestors(optionData?.cardTextAncestors,cardPolicy);
  const routePolicy=approvedRouteApproximationOption(paintOptions,review.source);
  // This host-only option narrows drawing within the already approved bundle.
  // It never changes source receipts or decides that an omitted frame is strict.
  const selectedFrames=optionData?.frameRegionIds;
  const frameRegionIds=selectedFrames===undefined?undefined:JSON.parse(snapshot(list(selectedFrames,3)));
  const retirements=selectApprovedFrameRetirements(review.retirements,optionData?.retirementIds);
  return async (/** @type {unknown} */ context) => {
    const data = record(context), connectorCornerMode = parseConnectorCornerMode(data.connectorCornerMode);
    const deck = record(data.deck), pages = list(deck.pages, 1), page = record(pages[0]);
    const { root, assets } = workspace(data.root), sourceFile = assetFile(root, path.relative(root, absolutePath(data.sourceFile)));
    const sourceBytes = readFile(sourceFile, 128 * 1024 * 1024);
    if (pages.length !== 1 || digest(sourceBytes) !== review.source.sha256) throw new TypeError("approved-frame-source-binding");
    const source = readPngBuffer(sourceBytes);
    if (source.width !== review.source.width || source.height !== review.source.height) throw new TypeError("approved-frame-source-binding");
    const originalShapes = list(page.shapes, 10000), originalImages = list(page.images, 10000), texts = list(page.textBoxes, 10000);
    const before = snapshot(deck), oldMeta = deck.meta, hadMeta = Object.hasOwn(deck, "meta"), oldShapes = page.shapes, oldImages = page.images,
      oldTexts = page.textBoxes, originalPage = pages[0], originalPages = deck.pages;
    const card=cardPolicy?prepareApprovedCardBackdrop(cardPolicy,{deck,page,shapes:originalShapes,images:originalImages,texts,textAncestors}):null;
    const route=routePolicy?prepareApprovedRouteApproximation(routePolicy,{deck,shapes:originalShapes,images:originalImages,texts,connectorCornerMode}):null;
    writable(page, "shapes"); writable(page, "images"); writable(deck, "meta");
    if(card)writable(page,'textBoxes');
    const strict = fingerprint({ source: page.source, compilation: oldMeta === undefined ? undefined : record(oldMeta).sourceSceneCompilation });
    const drawSession = createApprovedApproxFrameDrawSession({ source: review.source, slideSize: deck.slideSize,
      regionIds: ["region-n4", "region-n6", "region-n8"], approvalId: review.approvalId });
    const draw = drawSession.prepare(review.fits,frameRegionIds);
    if (draw.status !== "prepared" || !draw.shapes) throw new TypeError("approved-frame-draw-rejected");
    // The complete snapshot is already a bounded, hook-free JSON graph.
    /** @param {unknown} value @param {string} id @returns {number} */
    function references(value, id) {
      if (value === id) return 1;
      if (Array.isArray(value)) return value.reduce((sum, item) => sum + references(item, id), 0);
      if (value && typeof value === "object") return Object.values(value).reduce((sum, item) => sum + references(item, id), 0);
      return 0;
    }
    /** @type {unknown} */ const serialized = JSON.parse(before);
    for (const shape of draw.shapes) if (references(serialized, shape.id)) throw new TypeError("approved-frame-output-id-conflict");
    for (const retirement of retirements) {
      const existing = originalShapes.filter(item => record(item).id === retirement.id);
      if (existing.length !== 1 || fingerprint(existing[0]) !== retirement.fingerprint || references(serialized, retirement.id) !== 1) throw new TypeError("approved-frame-retirement-binding");
    }
    const pending = review.assets.map(row => {
      const members = originalImages.filter(item => record(item).id === row.imageId);
      if (members.length !== 1) throw new TypeError("approved-frame-asset-membership");
      const image = record(members[0]), file = assetFile(root, image.assetPath), original = readFile(file), after = readFile(row.afterFile);
      if (digest(original) !== row.beforeSha256 || digest(after) !== row.afterSha256) throw new TypeError("approved-frame-asset-binding");
      if (image.style !== undefined) {
        const style = record(image.style);
        if (style.assetPath !== undefined && style.assetPath !== image.assetPath) throw new TypeError("approved-frame-asset-alias-conflict");
      }
      const a = readPngBuffer(original), b = readPngBuffer(after);
      if (a.width !== b.width || a.height !== b.height) throw new TypeError("approved-frame-asset-size");
      return { row, image, file, after };
    });
    const identities = () => deck.pages === originalPages && list(deck.pages, 1)[0] === originalPage && deck.meta === oldMeta
      && page.shapes === oldShapes && page.images === oldImages && page.textBoxes === oldTexts
      && list(page.shapes, 10000).every((item, i) => item === originalShapes[i]) && list(page.images, 10000).every((item, i) => item === originalImages[i])
      && list(page.textBoxes, 10000).every((item, i) => item === texts[i]);
    await cancellation(data.isCancellationRequested);
    if (!identities() || snapshot(deck) !== before) throw new TypeError("approved-frame-page-changed");
    const directory = createStaging(assets); let published = false, retained = false;
    /** @type {{commit:()=>void,rollback:()=>void}|undefined} */let routeTransaction;
    /** @type {{commit:()=>void,rollback:()=>void}|null} */let frameTransaction=null;
    try {
      const applied = pending.filter(({ row }) => row.beforeSha256 !== row.afterSha256).map(({ row, image, file, after }) => {
        if (digest(readFile(file)) !== row.beforeSha256 || digest(readFile(row.afterFile)) !== row.afterSha256) throw new TypeError("approved-frame-asset-binding");
        const output = path.join(directory, row.imageId + ".png");
        writeAsset(output, after);
        if (digest(readFile(output)) !== row.afterSha256) throw new TypeError("approved-frame-write-binding");
        return { image, imageId: row.imageId, beforeAssetPath: path.relative(root, file).replaceAll("\\", "/"),
          assetPath: path.relative(root, output).replaceAll("\\", "/"), beforeSha256: row.beforeSha256, afterSha256: row.afterSha256 };
      });
      await cancellation(data.isCancellationRequested);
      if (!identities() || snapshot(deck) !== before) throw new TypeError("approved-frame-page-changed");
      if (digest(readFile(sourceFile, 128 * 1024 * 1024)) !== review.source.sha256) throw new TypeError("approved-frame-source-binding");
      for (const { row, file } of pending) if (digest(readFile(file)) !== row.beforeSha256) throw new TypeError("approved-frame-asset-binding");
      writable(page, "shapes"); writable(page, "images"); writable(deck, "meta");
      if(card)writable(page,'textBoxes');
      const consumed = drawSession.consume(draw.receipt, draw.shapes);
      if (consumed.status !== "consumed" || !consumed.shapes) throw new TypeError("approved-frame-draw-rejected");
      const shapes = originalShapes.filter(item => !retirements.some(row => row.id === record(item).id)); shapes.push(...consumed.shapes);
      const images = originalImages.map(item => {
        const delta = applied.find(row => row.image === item);
        if (!delta) return item;
        const image = record(item), style = image.style === undefined ? undefined : record(image.style);
        return { ...image, assetPath: delta.assetPath, ...(style?.assetPath === undefined ? {} : { style: { ...style, assetPath: delta.assetPath } }) };
      });
      const report = { policy: drawSession.policy, reviewFingerprint, sourceSha256: review.source.sha256, scopeFingerprint: drawSession.scopeFingerprint,
        retirementIds:retirements.map(row=>row.id),retirementScopeNarrowed:retirements.length<review.retirements.length,
        approximation: "user-approved-visible-edge-fit", sourceOwnership: "approved-approximate-background-reconstruction-not-strict",
        strictBaselineUnchanged: true, strictMeasurement: false, sourceFootprint: false, sourceErasure: false, wholeProductAcceptance: false,
        frames: consumed.memberIds, retiredNativeShapeIds: retirements.map(row => row.id),
        assets: applied.map(({ image: ignored, ...row }) => { void ignored; return row; }), appliedBeforeFinalSeal: true };
      if (fingerprint({ source: page.source, compilation: oldMeta === undefined ? undefined : record(oldMeta).sourceSceneCompilation }) !== strict) throw new TypeError("approved-frame-strict-evidence-changed");
      const finalShapes=card?[card.shape,...shapes.map(card.group)]:shapes,finalImages=card?images.map(card.group):images,finalTexts=card?texts.map(card.group):oldTexts;
      page.shapes = route?route.apply(finalShapes):finalShapes; page.images = finalImages;if(card)page.textBoxes=finalTexts;
      deck.meta = { ...(oldMeta === undefined ? {} : record(oldMeta)), approvedApproximateFrames: report,...(card?{approvedCardBackdrop:card.report}:{}),...(route?{approvedNativeRoute:route.report}:{}) }; published = true;
      routeTransaction=route?.publishMaterialization(context);
      frameTransaction=publishApprovedFrameCompletion(context,consumed.shapes,review.approvalId,review.source.sha256,review.source);
      // A later sibling commit can still fail. The lifecycle consumes the
      // receipt on success, so rollback stays available until the whole group
      // has committed; only an actual rollback closes this cleanup guard.
      const receipt = issueApprovedFrameApplication(context, { commit() { routeTransaction?.commit(); frameTransaction?.commit(); }, rollback() {
        if (retained) return;
        frameTransaction?.rollback();
        routeTransaction?.rollback();
        page.shapes = oldShapes; page.images = oldImages; if(card)page.textBoxes=oldTexts;
        if (!hadMeta) delete deck.meta; else deck.meta = oldMeta;
        removeStaging(assets, directory); retained = true;
      } });
      return receipt;
    } catch (error) {
      try {
        frameTransaction?.rollback();
        routeTransaction?.rollback();
        if (published) { page.shapes = oldShapes; page.images = oldImages; if(card)page.textBoxes=oldTexts;if (!hadMeta) delete deck.meta; else deck.meta = oldMeta; }
        removeStaging(assets, directory);
      } catch { throw new AggregateError([error], "approved-frame-rollback-failed"); }
      throw error;
    }
  };
}
module.exports = { createApprovedFrameAssetApplication };
