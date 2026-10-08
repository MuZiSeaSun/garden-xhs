import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'fs/promises';

const outdir = 'dist';
await mkdir(outdir, { recursive: true });
await copyFile('src/index.html', `${outdir}/index.html`);
await copyFile('src/style.css', `${outdir}/style.css`);

const options = {
  entryPoints: ['src/app.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  outfile: `${outdir}/app.js`,
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  treeShaking: true,
  supported: { 'dynamic-import': false },
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching...');
} else {
  await build(options);
  console.log('build done');
}
