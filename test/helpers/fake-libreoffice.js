"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function resolveFrameworkCompiler(environment) {
  const systemRoot = environment.SystemRoot || environment.SYSTEMROOT || environment.WINDIR;
  if (typeof systemRoot !== "string" || !path.isAbsolute(systemRoot) || /[\r\n\0]/u.test(systemRoot)) {
    throw new Error("Fake LibreOffice requires an absolute Windows system directory");
  }
  for (const framework of ["Framework64", "Framework"]) {
    const compiler = path.join(systemRoot, "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
    if (fs.statSync(compiler, { throwIfNoEntry: false })?.isFile()) return compiler;
  }
  throw new Error("Fake LibreOffice requires the installed .NET Framework C# compiler");
}

function createFakeLibreOffice(root, { run = spawnSync, environment = process.env } = {}) {
  if (!path.isAbsolute(root) || !fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("Fake LibreOffice output directory is unavailable");
  }
  const executable = path.join(root, "fake-libreoffice.exe");
  if (fs.existsSync(executable)) throw new Error("Fake LibreOffice executable already exists");
  const source = path.join(__dirname, "..", "fixtures", "fake-libreoffice.cs");
  const compiler = resolveFrameworkCompiler(environment);
  let result;
  try {
    result = run(compiler, ["/nologo", "/noconfig", "/target:exe", `/out:${executable}`, source], {
      encoding: "utf8", windowsHide: true, shell: false, timeout: 30000
    });
  } catch {
    throw new Error("Fake LibreOffice compiler could not start");
  }
  if (result?.error || result?.status !== 0) {
    const code = ["ETIMEDOUT", "ENOENT", "EACCES", "EPERM"].includes(result?.error?.code) ? result.error.code : "unknown";
    const status = Number.isSafeInteger(result?.status) ? result.status : "none";
    throw new Error(`Fake LibreOffice compilation failed (code=${code}, exit=${status})`);
  }
  const stat = fs.statSync(executable, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size === 0) throw new Error("Fake LibreOffice compiler did not produce an executable");
  return executable;
}

module.exports = { createFakeLibreOffice, resolveFrameworkCompiler };
