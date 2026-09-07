"use strict";
// @ts-check

const { createClient } = require("redis");

/** @param {{url: string, username: string, password: string}} options */
async function connectTeamRedis({ url, username, password }) {
  if (typeof url !== "string" || typeof username !== "string" || !username || typeof password !== "string" || !password) throw new TypeError("Redis connection configuration is invalid");
  let endpoint;
  try { endpoint = new URL(url); }
  catch { throw new TypeError("Redis endpoint is invalid"); }
  if (!["redis:", "rediss:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new TypeError("Redis endpoint is invalid");
  const client = createClient({
    url, username, password, disableOfflineQueue: true,
    socket: { connectTimeout: 5000, reconnectStrategy: (retries) => Math.min(3000, 100 * 2 ** Math.min(retries, 5)) }
  });
  // Socket errors drive SDK reconnection; command rejections and readiness expose
  // the outage to callers without logging provider messages or credentials.
  client.on("error", () => {});
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Redis initial connection timed out")), 10000); })
    ]);
    return client;
  } catch (cause) {
    if (client.isOpen) client.destroy();
    throw new Error("Redis connection is unavailable", { cause });
  } finally { clearTimeout(timer); }
}

module.exports = { connectTeamRedis };
