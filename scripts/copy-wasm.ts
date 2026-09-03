// Copies the built field.wasm into src/terrain/ (gitignored) so the worker can
// import it as a hashed asset in dev and in the bundle alike.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = path.join(root, 'wasm/field/target/wasm32-unknown-unknown/release/field.wasm');
const dst = path.join(root, 'src/terrain/field.wasm');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log(
  `copied ${path.relative(root, src)} (${fs.statSync(src).size} bytes) to src/terrain/field.wasm`,
);
