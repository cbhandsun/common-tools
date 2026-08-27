"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  searchOfficePlusComponents
} = require("./lib/officeplus-search");

function parseArgs(argv) {
  const args = {
    kind: "component",
    keywords: "",
    size: 12,
    start: 0,
    out: path.join("runs", "plugin-component-inventory", "officeplus-search.json")
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--kind" && next) {
      args.kind = next;
      i += 1;
    } else if (arg === "--keywords" && next) {
      args.keywords = next;
      i += 1;
    } else if (arg === "--size" && next) {
      args.size = Number(next);
      i += 1;
    } else if (arg === "--start" && next) {
      args.start = Number(next);
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await searchOfficePlusComponents(args);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`OfficePLUS ${result.kind} results: ${result.documents.length}/${result.total}`);
  for (const item of result.documents.slice(0, 8)) {
    console.log(`- ${item.id} ${item.title} [${item.reuseHint}]`);
  }
  console.log(`report: ${path.resolve(args.out)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs
};
