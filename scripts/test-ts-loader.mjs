import {readFileSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('..', import.meta.url)), require = createRequire(import.meta.url), cache = new Map();
export function loadTS(relative) {
  let file = resolve(root, relative);
  if (!extname(file)) file += existsSync(file + '.ts') ? '.ts' : '.tsx';
  if (file.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8'));
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = {exports: {}}; cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
  const localRequire = id => id.startsWith('@/') ? loadTS(id.slice(2)) : id.startsWith('.') ? loadTS(resolve(dirname(file), id)) : require(id);
  new Function('require', 'module', 'exports', code)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
