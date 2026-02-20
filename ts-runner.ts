#!/usr/bin/env npx tsx

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import * as readline from "readline";

// ─── Config ────────────────────────────────────────────────────────────────
const ROOT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.cwd();
const EXTENSIONS = [".ts", ".js"];
const IS_WIN = process.platform === "win32";

// ─── State ─────────────────────────────────────────────────────────────────
let currentDir = ROOT_DIR;
let selected = 0;
let waitingForKey = false;

// ─── Helpers ───────────────────────────────────────────────────────────────
type Entry = { name: string; isDir: boolean };

function getEntries(dir: string): Entry[] {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  const dirs: Entry[] = items
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => ({ name: d.name, isDir: true }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const files: Entry[] = items
    .filter((d) => d.isFile() && EXTENSIONS.includes(path.extname(d.name)))
    .map((d) => ({ name: d.name, isDir: false }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Agregar ".." si no estamos en el root inicial
  const withParent: Entry[] =
    path.resolve(dir) !== path.resolve(ROOT_DIR)
      ? [{ name: "..", isDir: true }, ...dirs, ...files]
      : [...dirs, ...files];

  return withParent;
}

function clearScreen() {
  process.stdout.write("\x1Bc");
}

function render(entries: Entry[]) {
  clearScreen();

  console.log(
    `\x1b[36m📁 ${currentDir}\x1b[0m  \x1b[90m[↑↓ mover | Enter abrir/ejecutar | r recargar | q salir]\x1b[0m\n`,
  );

  entries.forEach((e, i) => {
    const isSelected = i === selected;
    const cursor = isSelected ? "\x1b[32m▶ " : "  ";
    const icon = e.isDir ? "📂 " : "📄 ";

    let label: string;
    if (isSelected) {
      label = `\x1b[32m\x1b[1m${icon}${e.name}\x1b[0m`;
    } else if (e.isDir) {
      label = `\x1b[34m${icon}${e.name}\x1b[0m`;
    } else {
      label = `\x1b[37m${icon}${e.name}\x1b[0m`;
    }

    console.log(`${cursor}${label}`);
  });

  // Preview solo para archivos
  const cur = entries[selected];
  if (cur && !cur.isDir) {
    const preview = getPreview(cur.name);
    console.log("\n\x1b[90m" + "─".repeat(50) + "\x1b[0m");
  } else {
    console.log("\n\x1b[90m" + "─".repeat(50) + "\x1b[0m");
  }
}

function getPreview(file: string): string {
  try {
    return fs.readFileSync(path.join(currentDir, file), "utf8");
  } catch {
    return "(no se pudo leer)";
  }
}

function runFile(file: string) {
  const fullPath = path.resolve(path.join(currentDir, file));
  const ext = path.extname(file);

  clearScreen();
  console.log(`\n\x1b[36m▶ Ejecutando: ${file}\x1b[0m\n`);
  console.log("\x1b[90m" + "─".repeat(50) + "\x1b[0m\n");

  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();

  let cmd: string;
  let args: string[];

  if (ext === ".ts") {
    if (IS_WIN) {
      cmd = "cmd";
      args = ["/c", "npx", "tsx", fullPath];
    } else {
      cmd = "npx";
      args = ["tsx", fullPath];
    }
  } else {
    cmd = IS_WIN ? "cmd" : "node";
    args = IS_WIN ? ["/c", "node", fullPath] : [fullPath];
  }

  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
    cwd: path.dirname(fullPath),
  });

  if (result.error) {
    console.error("\n\x1b[31mError al ejecutar:\x1b[0m", result.error.message);
  }

  process.stdin.resume();
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  console.log("\n\x1b[90m" + "─".repeat(50) + "\x1b[0m");
  console.log("\x1b[33mPresiona cualquier tecla para volver...\x1b[0m");
}

// ─── Main ──────────────────────────────────────────────────────────────────
function main() {
  let entries = getEntries(currentDir);

  if (entries.length === 0) {
    console.log(`No se encontraron archivos .ts / .js en: ${currentDir}`);
    process.exit(0);
  }

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  render(entries);

  process.stdin.on("keypress", (_str, key) => {
    if (!key) return;

    if (waitingForKey) {
      waitingForKey = false;
      entries = getEntries(currentDir);
      if (selected >= entries.length) selected = entries.length - 1;
      render(entries);
      return;
    }

    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      clearScreen();
      process.exit(0);
    }

    if (key.name === "r") {
      entries = getEntries(currentDir);
      selected = 0;
      render(entries);
      return;
    }

    if (key.name === "up") {
      selected = (selected - 1 + entries.length) % entries.length;
      render(entries);
    } else if (key.name === "down") {
      selected = (selected + 1) % entries.length;
      render(entries);
    } else if (key.name === "return") {
      const cur = entries[selected];
      if (!cur) return;

      if (cur.isDir) {
        // Navegar a la carpeta
        if (cur.name === "..") {
          currentDir = path.dirname(currentDir);
        } else {
          currentDir = path.join(currentDir, cur.name);
        }
        selected = 0;
        entries = getEntries(currentDir);
        render(entries);
      } else {
        runFile(cur.name);
        waitingForKey = true;
      }
    }
  });
}

main();
