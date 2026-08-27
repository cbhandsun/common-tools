"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  scanComponentLibrary,
  buildComponentLibraryStoragePlan
} = require("./lib/component-library-storage");

function parseArgs(argv) {
  const args = {
    root: path.join("runs", "plugin-component-inventory"),
    out: ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--root" && next) {
      args.root = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else {
      throw new Error(`Unknown component-library-storage-audit argument: ${arg}`);
    }
  }
  if (!args.out) args.out = path.join(args.root, "component-library-storage-audit.json");
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.root);
  if (!fs.existsSync(root)) throw new Error(`Component library root does not exist: ${root}`);
  const plan = buildComponentLibraryStoragePlan(scanComponentLibrary(root));
  plan.root = root;
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(`files: ${plan.summary.files}`);
  console.log(`exact duplicate reclaimable MiB: ${(plan.summary.exactDuplicateReclaimableBytes / 1024 / 1024).toFixed(2)}`);
  console.log(`regenerable evidence MiB: ${(plan.summary.regenerableEvidenceBytes / 1024 / 1024).toFixed(2)}`);
  console.log(`storage audit: ${path.resolve(args.out)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs };
