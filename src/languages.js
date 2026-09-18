'use strict';

// Display names for VS Code language identifiers: everything VS Code ships with,
// plus the identifiers used by the popular language extensions. Anything not
// listed here still works: unknown ids are prettified (see languageName).

/** Time spent while no text editor is focused (terminal, settings, previews...). */
const NO_EDITOR = '(no editor)';

const NAMES = new Map(Object.entries({
  [NO_EDITOR]: 'No editor',

  // General purpose
  plaintext: 'Plain Text', c: 'C', cpp: 'C++', csharp: 'C#', 'objective-c': 'Objective-C',
  'objective-cpp': 'Objective-C++', 'cuda-cpp': 'CUDA C++', java: 'Java', kotlin: 'Kotlin', scala: 'Scala',
  groovy: 'Groovy', clojure: 'Clojure', clojurescript: 'ClojureScript', javascript: 'JavaScript',
  javascriptreact: 'JavaScript React', typescript: 'TypeScript', typescriptreact: 'TypeScript React',
  python: 'Python', cython: 'Cython', ruby: 'Ruby', php: 'PHP', go: 'Go', rust: 'Rust', swift: 'Swift',
  dart: 'Dart', lua: 'Lua', luau: 'Luau', perl: 'Perl', perl6: 'Raku', raku: 'Raku', r: 'R', rmd: 'R Markdown',
  julia: 'Julia', matlab: 'MATLAB', octave: 'Octave', haskell: 'Haskell', cabal: 'Cabal', ocaml: 'OCaml',
  fsharp: 'F#', vb: 'Visual Basic', elixir: 'Elixir', erlang: 'Erlang', elm: 'Elm', purescript: 'PureScript',
  reason: 'Reason', rescript: 'ReScript', haxe: 'Haxe', coffeescript: 'CoffeeScript', livescript: 'LiveScript',
  zig: 'Zig', nim: 'Nim', nimble: 'Nimble', d: 'D', crystal: 'Crystal', odin: 'Odin', v: 'V',
  lisp: 'Lisp', commonlisp: 'Common Lisp', scheme: 'Scheme', racket: 'Racket', fortran: 'Fortran',
  'fortran-modern': 'Fortran', 'fortran_free-form': 'Fortran (Free Form)', 'fortran-fixed-form': 'Fortran (Fixed Form)',
  cobol: 'COBOL', pascal: 'Pascal', objectpascal: 'Object Pascal', ada: 'Ada', coq: 'Coq', lean: 'Lean',
  lean4: 'Lean 4', agda: 'Agda', idris: 'Idris', prolog: 'Prolog', smalltalk: 'Smalltalk', apl: 'APL',
  abap: 'ABAP', apex: 'Apex', sas: 'SAS', stata: 'Stata', mojo: 'Mojo', gleam: 'Gleam', hack: 'Hack',
  vala: 'Vala', pony: 'Pony', factor: 'Factor', forth: 'Forth', ballerina: 'Ballerina',

  // Hardware, low level, graphics and games
  vhdl: 'VHDL', verilog: 'Verilog', systemverilog: 'SystemVerilog', asm: 'Assembly', nasm: 'NASM Assembly',
  masm: 'MASM Assembly', arm: 'ARM Assembly', wasm: 'WebAssembly', wat: 'WebAssembly Text', llvm: 'LLVM IR',
  glsl: 'GLSL', hlsl: 'HLSL', wgsl: 'WGSL', shaderlab: 'ShaderLab', gdscript: 'GDScript', gdshader: 'Godot Shader',
  qml: 'QML', solidity: 'Solidity', vyper: 'Vyper', move: 'Move', cairo: 'Cairo', openscad: 'OpenSCAD',
  gcode: 'G-code', ladder: 'Ladder Logic',

  // Shells and scripting
  shellscript: 'Shell Script', bash: 'Bash', zsh: 'Zsh', sh: 'Shell', fish: 'Fish', powershell: 'PowerShell',
  bat: 'Batch', nushell: 'Nushell', nu: 'Nushell', tcl: 'Tcl', awk: 'AWK', vim: 'Vim Script', viml: 'Vim Script',
  autohotkey: 'AutoHotkey', applescript: 'AppleScript', nix: 'Nix', just: 'Just', jsonnet: 'Jsonnet',

  // Web
  html: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less', stylus: 'Stylus', postcss: 'PostCSS',
  tailwindcss: 'Tailwind CSS', pug: 'Pug', jade: 'Pug', handlebars: 'Handlebars', mustache: 'Mustache',
  ejs: 'EJS', erb: 'ERB', haml: 'Haml', slim: 'Slim', liquid: 'Liquid', nunjucks: 'Nunjucks', twig: 'Twig',
  blade: 'Blade', 'django-html': 'Django HTML', 'django-txt': 'Django Template', jinja: 'Jinja',
  'jinja-html': 'Jinja HTML', razor: 'Razor', aspnetcorerazor: 'ASP.NET Razor', xaml: 'XAML', vue: 'Vue',
  'vue-html': 'Vue HTML', svelte: 'Svelte', astro: 'Astro', angular: 'Angular', htmx: 'HTMX', lit: 'Lit',
  markdown: 'Markdown', mdx: 'MDX', asciidoc: 'AsciiDoc', restructuredtext: 'reStructuredText',
  wikitext: 'Wikitext', xml: 'XML', xsl: 'XSL', xquery: 'XQuery', svg: 'SVG',

  // Data, config and infrastructure
  json: 'JSON', jsonc: 'JSON with Comments', json5: 'JSON5', jsonl: 'JSON Lines', yaml: 'YAML', toml: 'TOML',
  ini: 'INI', properties: 'Properties', dotenv: 'Dotenv', env: 'Env', csv: 'CSV', tsv: 'TSV',
  proto: 'Protocol Buffers', proto3: 'Protocol Buffers', protobuf: 'Protocol Buffers', thrift: 'Thrift',
  graphql: 'GraphQL', prisma: 'Prisma', sql: 'SQL', mysql: 'MySQL', pgsql: 'PostgreSQL', plsql: 'PL/SQL',
  cypher: 'Cypher', sparql: 'SPARQL', turtle: 'Turtle', kusto: 'Kusto', cue: 'CUE', dhall: 'Dhall', rego: 'Rego',
  hcl: 'HCL', terraform: 'Terraform', 'terraform-vars': 'Terraform Variables', bicep: 'Bicep', puppet: 'Puppet',
  ansible: 'Ansible', helm: 'Helm', 'azure-pipelines': 'Azure Pipelines',
  'github-actions-workflow': 'GitHub Actions', dockerfile: 'Dockerfile', dockercompose: 'Docker Compose',
  makefile: 'Makefile', cmake: 'CMake', meson: 'Meson', bazel: 'Bazel', starlark: 'Starlark', gradle: 'Gradle',
  nginx: 'Nginx', apacheconf: 'Apache Config', caddyfile: 'Caddyfile', powerquery: 'Power Query',
  'go.mod': 'Go Module', 'go.sum': 'Go Checksums', gotmpl: 'Go Template', hocon: 'HOCON', ignore: 'Ignore File',

  // Documents, testing and miscellaneous
  latex: 'LaTeX', tex: 'TeX', bibtex: 'BibTeX', doctex: 'DocTeX', log: 'Log', diff: 'Diff',
  'git-commit': 'Git Commit', 'git-rebase': 'Git Rebase', 'pip-requirements': 'Pip Requirements',
  jupyter: 'Jupyter Notebook', 'search-result': 'Search Result', snippets: 'Snippets', gherkin: 'Gherkin',
  feature: 'Gherkin', robotframework: 'Robot Framework', 'code-text-binary': 'Binary',
  'github-issues': 'GitHub Issues', scminput: 'Source Control Input',

  // More languages and formats from popular extensions
  al: 'AL', brightscript: 'BrightScript', chapel: 'Chapel', clarity: 'Clarity', dax: 'DAX', dylan: 'Dylan',
  earthfile: 'Earthfile', edn: 'EDN', eex: 'EEx', heex: 'HEEx', elisp: 'Emacs Lisp', fennel: 'Fennel',
  flux: 'Flux', gn: 'GN', gnuplot: 'Gnuplot', dot: 'Graphviz DOT', graphviz: 'Graphviz', hjson: 'Hjson',
  hy: 'Hy', idl: 'IDL', jq: 'jq', kdl: 'KDL', mermaid: 'Mermaid', plantuml: 'PlantUML', nextflow: 'Nextflow',
  nsis: 'NSIS', promql: 'PromQL', snakemake: 'Snakemake', sml: 'Standard ML', 'systemd-unit-file': 'systemd Unit',
  typespec: 'TypeSpec', typst: 'Typst', vbscript: 'VBScript', vba: 'VBA', yang: 'YANG', yara: 'YARA',
  cfml: 'ColdFusion', crontab: 'Crontab', dtd: 'DTD', editorconfig: 'EditorConfig', http: 'HTTP', hurl: 'Hurl',
  opencl: 'OpenCL', postscript: 'PostScript', qsharp: 'Q#', renpy: "Ren'Py", tsx: 'TSX', jsx: 'JSX',
  xhtml: 'XHTML', cuda: 'CUDA', ocamllex: 'OCamlLex', jsp: 'JSP', gitattributes: 'Git Attributes',
  'git-config': 'Git Config', ssh_config: 'SSH Config', dockerignore: 'Docker Ignore', wolfram: 'Wolfram Language',
  scilab: 'Scilab', lhaskell: 'Literate Haskell', ql: 'CodeQL', smarty: 'Smarty', slint: 'Slint', templ: 'Templ',
  bqn: 'BQN', janet: 'Janet', koka: 'Koka', roc: 'Roc', unison: 'Unison', pkl: 'Pkl', ron: 'RON', xonsh: 'Xonsh',

  // Proof assistants, smart contracts, embedded, mainframe and modelling
  'latex-expl3': 'LaTeX (expl3)', 'bibtex-style': 'BibTeX Style', isabelle: 'Isabelle', tlaplus: 'TLA+',
  alloy: 'Alloy', dafny: 'Dafny', cadence: 'Cadence', circom: 'Circom', yul: 'Yul', michelson: 'Michelson',
  tact: 'Tact', func: 'FunC', motoko: 'Motoko', aiken: 'Aiken', soql: 'SOQL', visualforce: 'Visualforce',
  netlogo: 'NetLogo', processing: 'Processing', arduino: 'Arduino', rpgle: 'RPGLE', jcl: 'JCL', hlasm: 'HLASM',
  rexx: 'REXX', pli: 'PL/I', minizinc: 'MiniZinc', pddl: 'PDDL',
}));

const titleCase = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/** Readable name for a language id. Unknown ids become "Some Language". */
function languageName(id) {
  if (!id) return 'Unknown';
  const known = NAMES.get(id);
  if (known) return known;
  return id.split(/[-_.\s]+/).filter(Boolean).map(titleCase).join(' ') || 'Unknown';
}

module.exports = { NO_EDITOR, languageName, KNOWN_LANGUAGE_COUNT: NAMES.size };
