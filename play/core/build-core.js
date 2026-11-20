// Builds one PLAY core from its recipe in play/core/cores.js into play/engine/<name>.js and .wasm.
// Licence: GPL-2.0-or-later (play/LICENSE). Anyone can repeat it from the published sources:
//   1. Emscripten:  git clone https://github.com/emscripten-core/emsdk ; emsdk install latest ; emsdk activate latest
//   2. The core:    git clone <repo in cores.js> ; git checkout <commit in cores.js>
//   3. node play/core/build-core.js <name>      (EMSDK and SRC point at the two folders; defaults are Bryan's PC)
// No change is made to any core's own files. Our side is play/core/host.c. These cores run on one thread, so the
// page does not need the thread settings DOSBox Pure needs (play/core/build.sh builds that one).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const os = require('os');

const name = process.argv[2];
const CORES = require('./cores');
const core = CORES[name];
if (!core) { console.error('Which core? One of: ' + Object.keys(CORES).join(', ')); process.exit(1); }

const EMSDK = process.env.EMSDK || 'C:/Users/bryan/play-build/emsdk';
const SRC = process.env.SRC || path.join('C:/Users/bryan/play-build', core.repo.split('/').pop());
const OUT = path.join(__dirname, '..', 'engine');
const OBJ = path.join(SRC, 'build', 'wasm');
const EM = path.join(EMSDK, 'upstream', 'emscripten');
const exe = (n) => { for (const x of [n + '.exe', n + '.bat', n]) if (fs.existsSync(path.join(EM, x))) return path.join(EM, x); throw new Error('No ' + n + ' in ' + EM); };
const CC = exe('emcc'), CXX = exe('em++');
const env = Object.assign({}, process.env, { EM_CONFIG: path.join(EMSDK, '.emscripten') });

const have = execFileSync('git', ['-C', SRC, 'rev-parse', 'HEAD']).toString().trim();
if (have !== core.commit) { console.error(core.title + ' is at ' + have + ' but cores.js names ' + core.commit); process.exit(1); }

// Every source file: the folders' .c files plus the named files.
const files = [];
for (const d of core.dirs || []) for (const f of fs.readdirSync(path.join(SRC, d))) if (f.endsWith('.c')) files.push(d + '/' + f);
files.push(...(core.files || []));
const missing = files.filter((f) => !fs.existsSync(path.join(SRC, f)));
if (missing.length) { console.error('Missing in ' + SRC + ':\n  ' + missing.join('\n  ')); process.exit(1); }

const common = ['-O2', '-DNDEBUG', ...core.include.map((i) => '-I' + path.join(SRC, i)), ...core.defines.map((d) => '-D' + d),
  '-Wno-implicit-function-declaration', '-Wno-incompatible-pointer-types', '-Wno-int-conversion', '-Wno-format'];
fs.mkdirSync(OBJ, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { env, shell: cmd.endsWith('.bat') });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code ? fail(new Error(args.slice(-3).join(' ') + '\n' + err.slice(-3000))) : ok()));
  });
}

async function main() {
  const objs = [];
  const queue = files.slice();
  let done = 0;
  const work = async () => {
    for (let f; (f = queue.shift());) {
      const o = path.join(OBJ, f.replace(/[\\/]/g, '_') + '.o');
      objs.push(o);
      const src = path.join(SRC, f);
      if (fs.existsSync(o) && fs.statSync(o).mtimeMs > fs.statSync(src).mtimeMs) { done++; continue; }
      const cxx = /\.(cpp|cxx|cc)$/.test(f);
      await run(cxx ? CXX : CC, [...common, ...(cxx ? core.cxx || [] : []), '-c', src, '-o', o]);
      done++;
    }
  };
  console.log(core.title + ': compiling ' + files.length + ' files');
  await Promise.all(Array.from({ length: Math.max(2, os.cpus().length - 2) }, work));
  const host = path.join(OBJ, 'play-host.o');
  // The host reads the core's own copy of libretro.h, wherever in its folders the core keeps it.
  await run(CC, ['-O2', ...core.include.map((i) => '-I' + path.join(SRC, i)), '-c', path.join(__dirname, 'host.c'), '-o', host]);
  console.log(core.title + ': linking');
  // Hundreds of object files go in a list file: Windows caps how long one command may be.
  const list = path.join(OBJ, 'objects.rsp');
  fs.writeFileSync(list, [...objs, host].map((o) => '"' + o.split(path.sep).join('/') + '"').join('\n'));
  await run(CXX, ['-O2', '@' + list, '-o', path.join(OUT, name + '.js'),
    '-sMODULARIZE=1', '-sEXPORT_NAME=PlayCore', '-sENVIRONMENT=worker', '-sALLOW_MEMORY_GROWTH=1',
    '-sINITIAL_MEMORY=67108864', '-sSTACK_SIZE=1048576', '-sFORCE_FILESYSTEM=1', '-sEXIT_RUNTIME=0',
    '-sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAP16,HEAPU32,stringToUTF8,lengthBytesUTF8', '-sEXPORTED_FUNCTIONS=_malloc,_free']);
  for (const ext of ['.js', '.wasm']) console.log('  ' + name + ext + ' ' + fs.statSync(path.join(OUT, name + ext)).size + ' bytes');
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
