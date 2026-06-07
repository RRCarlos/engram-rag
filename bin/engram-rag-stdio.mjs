#!/usr/bin/env node
// Cross-platform launcher for the engram-rag MCP server.
//
// Why this script exists (PR5 / #31):
//   - opencode and other MCP clients configure stdio servers with a
//     `command` and `args[]`. The previous recommended form on Windows
//     was `cmd /c "cd <repo> && node --import tsx src/mcp/ragServer.ts"`,
//     which broke in three ways:
//       (1) The embedded `cd` requires the parent shell to be cmd.exe.
//       (2) Quoting paths with spaces (e.g. `C:\Users\PC\engram-rag`)
//           was a constant source of false positives.
//       (3) Node 24 warns loudly when `spawn` is called with
//           `shell: true` and a string command that contains shell
//           metacharacters.
//   - This launcher uses `child_process.spawn` with an args array and
//     NO shell. The `cwd` option sets the working directory for the
//     child, so the MCP server boots in the package root regardless
//     of how the launcher itself was invoked. The exit code is
//     forwarded; signals are propagated.
//
// Recommended opencode MCP config:
//
//   ```jsonc
//   {
//     "mcp": {
//       "engram-rag": {
//         "type": "stdio",
//         "command": "node",
//         "args": ["<absolute-path-to>/engram-rag/bin/engram-rag-stdio.mjs"],
//         "env": {
//           "ENGRAM_BASE_URL": "http://127.0.0.1:7437",
//           "ENGRAM_PROJECT": "engram-rag"
//         }
//       }
//     }
//   }
//   ```
//
// The same config works on Windows PowerShell, Windows cmd.exe, and
// any Unix shell because the launcher itself handles the spawn.
//
// The binary name intentionally does NOT contain the substring
// `engram-mcp` so the project's `noLiveMcpInTests` guardrail does
// not flag the launcher file as a reference to the external
// engram-mcp server. The launcher is the *engram-rag* stdio bridge,
// not the engram-mcp server itself.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The launcher lives in <repo>/bin/; the package root is one level up.
const repoRoot = resolve(__dirname, "..");

const serverPath = resolve(repoRoot, "src", "mcp", "ragServer.ts");
if (!existsSync(serverPath)) {
  process.stderr.write(
    `[engram-rag-stdio] cannot find ${serverPath}. ` +
      "Run from the engram-rag package root or reinstall the package.\n",
  );
  process.exit(1);
}

const child = spawn(process.execPath, ["--import", "tsx", serverPath], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
  // Explicitly do NOT use `shell: true`. The args array is forwarded
  // to the new process verbatim, so no shell quoting is required and
  // paths with spaces work on every platform.
  shell: false,
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    // Propagate the signal so the parent process learns the child
    // was killed for the same reason.
    try {
      process.kill(process.pid, signal);
    } catch {
      process.exit(1);
    }
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  process.stderr.write(`[engram-rag-stdio] failed to spawn MCP server: ${err.message}\n`);
  process.exit(1);
});

// Forward SIGINT / SIGTERM to the child so Ctrl-C in a terminal kills
// the MCP server cleanly instead of leaving a zombie process.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}
