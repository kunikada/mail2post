// esbuild.config.js
import { build } from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import { argv, env } from 'process';

const sharedConfig = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  minify: false,
  plugins: [nodeExternalsPlugin()],
  outdir: '.build',
  format: 'esm',
  external: [
    '@aws-sdk/*',
    'aws-sdk',
    'stream',
    'util',
    'fs',
    'path',
    'crypto',
    'os',
    'http',
    'https',
    'url',
    'querystring',
    'assert',
    'buffer',
    'events',
    'net',
    'tls',
    'dns',
    'dgram',
    'child_process',
    'cluster',
    'zlib',
    'readline',
    'timers',
    'v8',
    'vm',
    'worker_threads',
  ],
};

// 開発ビルド設定
const devBuild = async () => {
  const options = {
    ...sharedConfig,
    sourcemap: true,
    minify: false,
  };

  if (argv.includes('--watch')) {
    // ウォッチモード設定
    await build({
      ...options,
      watch: true,
    });
    // コンテキストを保持してウォッチモード継続
  } else {
    await build(options);
  }
};

// 本番ビルド設定
const prodBuild = async () => {
  await build({
    ...sharedConfig,
    sourcemap: false,
    minify: true,
  });
};

// 環境に応じたビルド実行
const isProd = env.NODE_ENV === 'production';
if (isProd) {
  prodBuild();
} else {
  devBuild();
}
