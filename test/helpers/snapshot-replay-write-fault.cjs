"use strict";
const path = require("node:path");

// Keep fault injection scoped to this replay; never target the runner's pipes.
function injectSnapshotReplayWriteFault(mock, fileSystem, root) {
  const write = fileSystem.writeFileSync, open = fileSystem.openSync, close = fileSystem.closeSync;
  const descriptors = new Set();
  const opened = mock.method(fileSystem, "openSync", (file, flags, ...args) => {
    const descriptor = open(file, flags, ...args);
    if (flags === "wx" && typeof file === "string" && path.dirname(path.dirname(file)) === root
      && path.basename(path.dirname(file)).startsWith("quality-snapshot-replay-")) descriptors.add(descriptor);
    return descriptor;
  });
  // Reads and closed handles must never survive as write targets: operating
  // systems reuse descriptor numbers, including for the test runner transport.
  const closed = mock.method(fileSystem, "closeSync", (descriptor, ...args) => {
    try { return close(descriptor, ...args); }
    finally { descriptors.delete(descriptor); }
  });
  const blocked = mock.method(fileSystem, "writeFileSync", (file, ...args) => {
    if (descriptors.delete(file)) {
      fileSystem.writeSync(file, Buffer.from("partial"));
      throw new Error("write interrupted");
    }
    return write(file, ...args);
  });
  let restored = false;
  return { restore() {
    if (restored) return;
    restored = true;
    blocked.mock.restore(); closed.mock.restore(); opened.mock.restore(); descriptors.clear();
  } };
}

module.exports = { injectSnapshotReplayWriteFault };
