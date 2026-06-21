#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const localDotnet = path.resolve(__dirname, "..", ".tools", "dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
const dotnet = process.env.DOTNET_BIN || (fs.existsSync(localDotnet) ? localDotnet : "dotnet");
const result = spawnSync(dotnet, process.argv.slice(2), {
  stdio: "inherit",
  shell: false
});

process.exit(result.status ?? 1);
