"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { connectTeamRedis } = require("../packages/remote-mcp-server/redis-connection");

test("Redis connection rejects invalid configuration without exposing supplied values", async () => {
  for (const input of [
    { url: "private malformed endpoint", username: "default", password: "private-secret" },
    { url: "https://private-host", username: "default", password: "private-secret" },
    { url: "redis://user:private-secret@private-host", username: "default", password: "private-secret" },
    { url: "redis://private-host", username: "", password: "private-secret" },
    { url: "redis://private-host", username: "default", password: null },
    { url: { toString() { throw new Error("must not coerce"); } }, username: "default", password: "private-secret" }
  ]) {
    await assert.rejects(connectTeamRedis(input), (error) => error instanceof TypeError && ["Redis endpoint is invalid", "Redis connection configuration is invalid"].includes(error.message));
  }
});
