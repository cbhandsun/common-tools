"use strict";

const { Client } = require("pg");
const { connectTeamRedis } = require("../../packages/remote-mcp-server/redis-connection");
const { createRedisQueue } = require("../../packages/remote-mcp-server/team-providers");
const { PostgresJobRepository, TeamWorker, TeamWorkerRunner, recoverWorkerLeases } = require("../../packages/team-runtime");

// This controlled handler exercises the production runner in an independent process.
// Credentials arrive over inherited IPC, never argv, stdout or stderr.
process.once("message", async (settings) => {
  const database = new Client(settings.database);
  let redis;
  try {
    await database.connect();
    redis = await connectTeamRedis(settings.redis);
    const repository = new PostgresJobRepository({ query: database.query.bind(database) });
    const queue = createRedisQueue(redis, "recovery-fixture");
    const capability = settings.imageFixture ? "image-to-editable" : "project-audit";
    await recoverWorkerLeases({ repository, queue, actorId: settings.workerId, capability });
    const worker = new TeamWorker({ repository, leaseSeconds: 30, handlers: {
      ...(settings.imageFixture ? { "image-to-editable": require("./image-recovery-handler.cjs").imageRecoveryHandler(settings) } : {}),
      "project-audit": async ({ job }) => {
        process.send({ phase: "claimed", id: job.id, attempt: job.attempt });
        if (settings.pause) await new Promise(() => {});
        return { artifacts: [], quality: { passed: true, checks: [{ name: "controlled-handler", passed: true }], metrics: {} } };
      }
    } });
    const runner = new TeamWorkerRunner({ queue, worker, workerId: settings.workerId, capability, pollSeconds: 1 });
    const result = await runner.processOne();
    process.send({ phase: "completed", status: result?.status, attempt: result?.attempt });
  } catch {
    process.exitCode = 1;
    process.send({ phase: "failed" });
  } finally {
    if (redis?.isOpen) redis.destroy();
    await database.end();
    process.disconnect();
  }
});
