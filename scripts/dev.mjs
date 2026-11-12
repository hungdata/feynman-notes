#!/usr/bin/env node
// One command for local development: installs missing dependencies, then runs
// the API (http://localhost:5051) and the web app (http://localhost:5173).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const colors = { api: "\x1b[36m", web: "\x1b[35m", reset: "\x1b[0m" };

const [nodeMajor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22) console.warn(`\n⚠ Đang dùng Node ${process.versions.node}. Mind map vẫn chạy, nhưng tính năng đọc sách PDF cần Node 22 trở lên.\n`);

// Installs when node_modules is missing or a dependency was added since the last install.
const missingDependencies = (app) => {
  const modules = path.join(root, app, "node_modules");
  if (!fs.existsSync(modules)) return true;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, app, "package.json"), "utf8"));
  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).some((name) => !fs.existsSync(path.join(modules, name, "package.json")));
};

for (const app of ["backend", "frontend"]) {
  if (missingDependencies(app)) {
    console.log(`\n▸ Cài thư viện cho ${app}…`);
    const result = spawnSync(npm, ["install", "--no-audit", "--no-fund"], { cwd: path.join(root, app), stdio: "inherit", shell: isWindows });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

const children = [];
const run = (name, cwd, args) => {
  const child = spawn(npm, args, { cwd: path.join(root, cwd), shell: isWindows, env: { ...process.env, FORCE_COLOR: "1" } });
  const prefix = `${colors[name]}[${name}]${colors.reset} `;
  const pipe = (stream, target) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      lines.forEach((line) => target.write(`${prefix}${line}\n`));
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (code && code !== 0) console.error(`${prefix}đã dừng (mã ${code})`);
    children.forEach((other) => other !== child && other.kill());
    process.exit(code || 0);
  });
  children.push(child);
};

run("api", "backend", ["run", "dev"]);
run("web", "frontend", ["run", "dev", "--", "--open"]);

const stop = () => { children.forEach((child) => child.kill("SIGINT")); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
