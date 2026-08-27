"use strict";

const { execFile } = require("child_process");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
      timeout: options.timeout,
      env: options.env ? { ...process.env, ...options.env } : process.env
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

module.exports = { run };
