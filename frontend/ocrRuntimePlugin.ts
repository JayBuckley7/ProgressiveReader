import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Serve pinned npm OCR worker/WASM assets from our own origin in dev and builds. */
export function ocrRuntimePlugin(): Plugin {
  const core = path.resolve('node_modules/tesseract.js-core');
  const files = new Map<string, string>(fs.readdirSync(core).filter(name => /^tesseract-core.*\.(js|wasm)$/.test(name)).map(name => [name, path.join(core, name)]));
  files.set('worker.min.js', path.resolve('node_modules/tesseract.js/dist/worker.min.js'));
  const dictionary = path.resolve('node_modules/kuromoji/dict');
  for (const name of fs.readdirSync(dictionary).filter(name => name.endsWith('.dat.gz'))) files.set(`dict/${name}`, path.join(dictionary, name));
  return {
    name: 'local-ocr-runtime',
    configureServer(server) {
      server.middlewares.use('/ocr-runtime', (req, res, next) => {
        const name = (req.url || '').split('?')[0].replace(/^\//, '');
        const file = files.get(name); if (!file) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.gz') ? 'application/gzip' : 'application/javascript');
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() { for (const [name, file] of files) this.emitFile({ type: 'asset', fileName: `ocr-runtime/${name}`, source: fs.readFileSync(file) }); },
  };
}
