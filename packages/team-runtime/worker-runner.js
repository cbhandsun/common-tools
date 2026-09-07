// @ts-check
"use strict";
const {assertNonEmptyString} = require("../capability-contracts");
/** @type {(value: unknown, label: string) => asserts value is Record<string, unknown>} */
const assertPlainObject = require("../capability-contracts").assertPlainObject;
// The runner owns queue acknowledgement. It acknowledges only after the
// database-backed worker has made a terminal transition (or found a duplicate
// delivery), so a database/queue outage leaves the delivery recoverable.
/** @param {ReadonlySet<string>} capabilities */
function createWorkerRunner(capabilities) {
return class TeamWorkerRunner {
  /** @param {{queue: {reserve: (seconds: number, capability: string) => Promise<unknown>, ack: (message: Record<string, unknown>) => Promise<unknown>}, worker: {process: (message: Record<string, unknown>, workerId: string) => Promise<unknown>}, workerId: string, capability: string, pollSeconds?: number}} options */
  constructor({ queue, worker, workerId, capability, pollSeconds = 5 }) {
    if (!queue || typeof queue.reserve !== "function" || typeof queue.ack !== "function") throw new TypeError("worker queue is incomplete");
    if (!worker || typeof worker.process !== "function") throw new TypeError("worker processor is incomplete");
    this.workerId = assertNonEmptyString(workerId, "workerId");
    if (!capabilities.has(capability)) throw new Error("worker runner capability is invalid");
    this.capability = capability;
    if (!Number.isSafeInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 60) throw new RangeError("worker pollSeconds must be between 1 and 60");
    this.queue = queue;
    this.worker = worker;
    this.pollSeconds = pollSeconds;
  }
  async processOne() {
    const message = await this.queue.reserve(this.pollSeconds, this.capability);
    if (!message) return null;
    assertPlainObject(message, "queue delivery");
    assertNonEmptyString(message.id, "queue delivery id");
    if (message.capability !== this.capability) throw new Error("queue delivery capability is invalid");
    const completed = await this.worker.process(message, this.workerId);
    await this.queue.ack(message);
    return completed;
  }
};
}

module.exports = {createWorkerRunner};
