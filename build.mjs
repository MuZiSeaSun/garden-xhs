import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, rm } from 'fs/promises';

const outdir = 'dist';
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyFile('src/index.html', `${outdir}/index.html`);

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

const options = {
  entryPoints: ['src/app.ts'],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  target: ['es2017'],
  outfile: `${outdir}/app.js`,
  loader: { '.woff2': 'file', '.woff': 'file', '.svg': 'file', '.png': 'file', '.jpg': 'file', '.webp': 'file' },
  assetNames: 'assets/[name]-[hash]',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  treeShaking: true,
  supported: { 'dynamic-import': false },
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
  plugins: [stripLibraryCjkFonts],
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching...');
} else {
  await build(options);
  console.log('build done');
}
