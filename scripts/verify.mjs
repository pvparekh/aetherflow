import { spawnSync } from "node:child_process";
for (const [command, args] of [
  ["npx", ["tsc", "--noEmit"]],
  ["npm", ["run", "lint"]],
  ["npx", ["vitest", "run"]],
  ["npm", ["run", "build"]],
]) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
