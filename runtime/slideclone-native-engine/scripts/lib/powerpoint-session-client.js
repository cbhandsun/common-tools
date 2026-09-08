"use strict";

const http = require("node:http");

const URL_KEY = "SLIDECLONE_POWERPOINT_SESSION_URL";
const TOKEN_KEY = "SLIDECLONE_POWERPOINT_SESSION_TOKEN";
const MAX_RESPONSE_BYTES = 4096;

function cleanPowerPointSessionEnvironment(environment = {}) {
  const result = { ...environment };
  delete result[URL_KEY];
  delete result[TOKEN_KEY];
  return result;
}

function takePowerPointSessionEnvironment(environment = {}) {
  const rawUrl = environment[URL_KEY];
  const token = environment[TOKEN_KEY];
  delete environment[URL_KEY];
  delete environment[TOKEN_KEY];
  if (rawUrl === undefined && token === undefined) return Object.freeze({});
  if (typeof rawUrl !== "string" || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) {
    throw new Error("PowerPoint session configuration is invalid");
  }
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password
      || url.search || url.hash || url.pathname !== "/") {
    throw new Error("PowerPoint session endpoint is invalid");
  }
  return Object.freeze({ [URL_KEY]: url.href, [TOKEN_KEY]: token });
}

function authorizePowerPointSession(environment, { timeoutMs = 5000 } = {}) {
  const session = takePowerPointSessionEnvironment({ ...environment });
  if (!session[URL_KEY]) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    const url = new URL("v1/lease", session[URL_KEY]);
    const request = http.request(url, {
      method: "POST",
      headers: { authorization: `Bearer ${session[TOKEN_KEY]}`, "content-length": "0" }
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) request.destroy(new Error("PowerPoint session response exceeds limits"));
        else chunks.push(chunk);
      });
      response.once("end", () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (response.statusCode !== 200 || payload?.ready !== true || payload?.provider !== "powerpoint-corpus-session-v1") {
            throw new Error("PowerPoint session authorization failed");
          }
          resolve(true);
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("PowerPoint session authorization timed out")));
    request.once("error", () => reject(new Error("PowerPoint session authorization failed")));
    request.end();
  });
}

module.exports = { URL_KEY, TOKEN_KEY, authorizePowerPointSession, cleanPowerPointSessionEnvironment, takePowerPointSessionEnvironment };
