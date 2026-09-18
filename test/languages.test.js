'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { languageName, NO_EDITOR, KNOWN_LANGUAGE_COUNT } = require('../src/languages');

test('known names', () => {
  const expected = {
    typescript: 'TypeScript', typescriptreact: 'TypeScript React', javascript: 'JavaScript', csharp: 'C#',
    cpp: 'C++', 'objective-c': 'Objective-C', fsharp: 'F#', shellscript: 'Shell Script', python: 'Python',
    rust: 'Rust', go: 'Go', kotlin: 'Kotlin', swift: 'Swift', dart: 'Dart', vue: 'Vue', svelte: 'Svelte',
    terraform: 'Terraform', dockerfile: 'Dockerfile', jsonc: 'JSON with Comments', plaintext: 'Plain Text',
    markdown: 'Markdown', sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS', yaml: 'YAML', toml: 'TOML',
    latex: 'LaTeX', solidity: 'Solidity', gdscript: 'GDScript', 'cuda-cpp': 'CUDA C++', wgsl: 'WGSL',
    zig: 'Zig', elixir: 'Elixir', haskell: 'Haskell', ocaml: 'OCaml', julia: 'Julia', r: 'R', lua: 'Lua',
  };
  for (const [id, name] of Object.entries(expected)) assert.equal(languageName(id), name, id);
});

test('many languages are known', () => {
  assert.ok(KNOWN_LANGUAGE_COUNT >= 300, 'only ' + KNOWN_LANGUAGE_COUNT + ' languages known');
});

test('no editor label', () => {
  assert.equal(languageName(NO_EDITOR), 'No editor');
});

test('unknown ids get a readable name', () => {
  assert.equal(languageName('somelang'), 'Somelang');
  assert.equal(languageName('my-fancy_lang'), 'My Fancy Lang');
  assert.equal(languageName('foo.bar'), 'Foo Bar');
  assert.equal(languageName(''), 'Unknown');
  assert.equal(languageName(undefined), 'Unknown');
  assert.equal(languageName('---'), 'Unknown');
});

test('ids like constructor are just unknown', () => {
  assert.equal(languageName('constructor'), 'Constructor');
  assert.equal(languageName('__proto__'), 'Proto');
  assert.equal(languageName('toString'), 'ToString');
  assert.equal(typeof languageName('hasOwnProperty'), 'string');
});

test('no duplicate ids', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'languages.js'), 'utf8');
  const body = src.slice(src.indexOf('Object.entries({'), src.indexOf('}));'));
  const keys = [...body.matchAll(/(?:^|[,{\s])(?:'([^']+)'|([A-Za-z0-9_]+)|\[NO_EDITOR\])\s*:/gm)]
    .map((m) => m[1] || m[2] || 'NO_EDITOR');
  const seen = new Set();
  for (const k of keys) {
    assert.ok(!seen.has(k), 'duplicate language id: ' + k);
    seen.add(k);
  }
  assert.ok(seen.size >= 300);
});
