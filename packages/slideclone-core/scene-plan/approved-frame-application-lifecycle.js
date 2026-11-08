// @ts-check
"use strict";
const { types } = require("node:util");
const {withApprovedRouteMaterializationFinalizer}=require('./approved-route-materialization');
const {withApprovedFrameCompletionFinalizer}=require('./approved-frame-completion');
/** @type {WeakMap<object,{context:unknown,commit:()=>void,rollback:()=>void}>} */
const transactions = new WeakMap();
/** Internal capability: only a process-local receipt can close a prepared
 * application. No JSON field creates one.
 * @param {unknown} context @param {{commit:()=>void,rollback:()=>void}} transaction */
function issueApprovedFrameApplication(context, transaction) {
  const receipt = Object.freeze(Object.create(null)); transactions.set(receipt, { context, ...transaction }); return receipt;
}
/** The composition root supplies the synchronous final seal/audit operation.
 * A failed seal rolls back this application's page fields and new files.
 * @template T @param {undefined|((context:unknown)=>Promise<unknown>)} apply
 * @param {unknown} context @param {()=>T} finalize @returns {Promise<T>} */
async function finalizeWithApprovedFrames(apply, context, finalize) {
  if (apply === undefined) return finalize();
  const receipt = await apply(context);
  const transaction = receipt && typeof receipt === "object" && !types.isProxy(receipt) ? transactions.get(receipt) : undefined;
  if (!transaction || transaction.context !== context) throw new TypeError("invalid-approved-frame-application-receipt");
  transactions.delete(/** @type {object} */ (receipt));
  try {
    const result = withApprovedFrameCompletionFinalizer(context,()=>withApprovedRouteMaterializationFinalizer(context,finalize));
    if (result && (typeof result === "object" || typeof result === "function") && "then" in result) throw new TypeError("approved-frame-finalizer-must-be-synchronous");
    transaction.commit(); return result;
  } catch (error) {
    try { transaction.rollback(); }
    catch { throw new AggregateError([error], "approved-frame-rollback-failed"); }
    throw error;
  }
}
/** Combine trusted dependencies without committing intermediate applications.
 * A later rejection reverses every prepared transaction, in reverse order.
 * @param {((context:unknown)=>Promise<unknown>)[]} applications */
function composeApprovedAssetApplications(...applications) {
  if (!applications.length || applications.length > 16 || applications.some(apply => typeof apply !== 'function')) throw new TypeError('invalid-approved-asset-applications');
  return async (/** @type {unknown} */ context) => {
    /** @type {{commit:()=>void,rollback:()=>void}[]} */ const pending = [];
    const rollback = () => {
      /** @type {unknown[]} */ const errors = [];
      for (const item of pending.slice().reverse()) try { item.rollback(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'approved-asset-rollback-failed');
    };
    try {
      for (const apply of applications) {
        const receipt = await apply(context);
        const item = receipt && typeof receipt === 'object' && !types.isProxy(receipt) ? transactions.get(receipt) : undefined;
        if (!item || item.context !== context) throw new TypeError('invalid-approved-frame-application-receipt');
        transactions.delete(/** @type {object} */ (receipt)); pending.push(item);
      }
      return issueApprovedFrameApplication(context, { commit() { for (const item of pending) item.commit(); }, rollback });
    } catch (error) {
      try { rollback(); } catch { throw new AggregateError([error], 'approved-asset-rollback-failed'); }
      throw error;
    }
  };
}
module.exports = { issueApprovedFrameApplication, finalizeWithApprovedFrames, composeApprovedAssetApplications };
