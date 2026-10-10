import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const stripLibraryCjkFonts = {
  name: 'strip-library-cjk-fonts',
  setup(build) {
    build.onLoad({ filter: /(animal-island-ui|animal-island-vue)[\\/].*\.css$/ }, async (args) => {
      const css = await readFile(args.path, 'utf8');
      const contents = css.replace(/@font-face\{[^}]*font-family:\s*Noto Sans SC\b[^}]*\}/g, '');
      return { contents, loader: 'css' };
    });
  },
};


const dir = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(dir, 'dist');
const src = resolve(dir, 'src');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyFile(resolve(src, 'index.html'), resolve(outdir, 'index.html'));

await build({
  absWorkingDir: dir,
  entryPoints: [resolve(src, 'main.tsx')],
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  outdir,
  entryNames: 'app',
  assetNames: 'assets/[name]-[hash]',
  loader: {
    '.woff2': 'file',
    '.woff': 'file',
    '.svg': 'file',
    '.png': 'file',
    '.jpg': 'file',
    '.webp': 'file',
  },
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  treeShaking: true,
  supported: { 'dynamic-import': false },
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
  plugins: [stripLibraryCjkFonts],
});

console.log('react-test build done:', outdir);
