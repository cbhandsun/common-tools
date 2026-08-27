"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { searchIslideContents } = require("./lib/islide-search");

function parseArgs(argv) {
  const args = {
    kind: "diagram",
    keywords: "流程",
    size: 6,
    start: 0,
    out: path.join("runs", "plugin-component-inventory", "islide-search.json")
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
  const result = await searchIslideContents(args);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`iSlide ${result.kind} results: ${result.documents.length}/${result.total || 0}`);
  for (const document of result.documents.slice(0, 6)) {
    console.log(`- ${document.id} ${document.title} ${document.reuseHint}`);
  }
  console.log(`report: ${path.resolve(args.out)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs
};
