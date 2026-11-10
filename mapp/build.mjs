import { execFileSync } from 'node:child_process';
import { error, log } from 'node:console';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist-mapp');
const atlasPath = 'images/bean-mascots.webp';
const sdkRepo = 'https://github.com/linux-do/mapp-developer-guide.git';
const sdkCommit = '7792ce37b3e09684b9e3d918f968f2cbd79df3fb';
const require = createRequire(import.meta.url);

// 沙箱只允许 Blob 图片。Phaser 的混色检测和内置纹理默认使用 data: PNG。
const phaserSandbox = {
  name: 'wallbait-mapp-phaser-sandbox',
  transform(source, id) {
    if (!/\/node_modules\/phaser\/dist\/phaser(?:\.esm)?\.js$/.test(id)) return;
    // SDK 将媒体采集 API 锁为只读，保留 Phaser 后续的能力读取。
    const mediaPolyfill =
      /navigator\.getUserMedia = navigator\.getUserMedia[^;\r\n]*;/;
    if (!mediaPolyfill.test(source)) {
      throw new Error('Phaser 媒体能力检测已变更，请核对微应用沙箱兼容性。');
    }
    source = source.replace(mediaPolyfill, '');
    const assignments = [
      [
        "yellow.src = pngHead + '/wCKxvRF' + pngEnd;",
        "yellow, pngHead + '/wCKxvRF' + pngEnd",
      ],
      [
        "magenta.src = pngHead + 'AP804Oa6' + pngEnd;",
        "magenta, pngHead + 'AP804Oa6' + pngEnd",
      ],
      ['image.src = data;', 'image, data'],
    ];
    for (const [assignment, args] of assignments) {
      if (!source.includes(assignment)) {
        throw new Error('Phaser 图片加载实现已变更，请核对微应用沙箱兼容性。');
      }
      source = source.replace(assignment, `setWallbaitImageSource(${args});`);
    }
    return (
      source +
      `
      function setWallbaitImageSource(image, source) {
        const prefix = 'data:image/png;base64,';
        if (!source.startsWith(prefix)) {
          image.src = source;
          return;
        }
        const bytes = Uint8Array.from(atob(source.slice(prefix.length)), char => char.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        const release = () => URL.revokeObjectURL(url);
        image.addEventListener('load', release, { once: true });
        image.addEventListener('error', release, { once: true });
        image.src = url;
      }
    `
    );
  },
};

async function buildMapp() {
  const env = await readFile(join(root, '.env.mapp.local'), 'utf8').catch(
    (err) => {
      if (err.code === 'ENOENT') return '';
      throw err;
    },
  );
  const id = parseEnv(env).MINI_APP_ID?.trim();
  if (!id || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(
      '请在项目根目录的 .env.mapp.local 填写有效的 MINI_APP_ID。',
    );
  }

  await mkdir(output, { recursive: true });
  const temp = await mkdtemp(join(output, '.build-'));
  try {
    execFileSync('git', ['init', '--quiet', temp], { stdio: 'inherit' });
    execFileSync('git', ['fetch', '--quiet', '--depth=1', sdkRepo, sdkCommit], {
      cwd: temp,
      stdio: 'inherit',
    });
    execFileSync('git', ['checkout', '--quiet', 'FETCH_HEAD', '--', 'sdk'], {
      cwd: temp,
      stdio: 'inherit',
    });

    const sdk = join(temp, 'sdk');
    const entry = join(import.meta.dirname, 'main.ts');
    const config = join(temp, 'tsconfig.json');
    await writeFile(
      config,
      JSON.stringify({
        extends: join(root, 'tsconfig.json'),
        include: [],
        files: [entry],
        compilerOptions: {
          paths: { '@discourse-mini-app/sdk': [join(sdk, 'index.d.ts')] },
        },
      }),
    );
    execFileSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '--project', config],
      { stdio: 'inherit' },
    );

    const web = join(temp, 'web');
    await build({
      root,
      configFile: false,
      envFile: false,
      publicDir: false,
      plugins: [phaserSandbox],
      resolve: {
        alias: { '@discourse-mini-app/sdk': join(sdk, 'index.mjs') },
      },
      build: {
        outDir: web,
        target: 'es2022',
        chunkSizeWarningLimit: 1500,
        lib: {
          entry,
          name: 'Wallbait',
          formats: ['iife'],
          fileName: () => 'app.js',
          cssFileName: 'app',
        },
      },
    });

    const { pack } = await import(pathToFileURL(join(sdk, 'pack.mjs')).href);
    const html = await readFile(
      join(import.meta.dirname, 'index.html'),
      'utf8',
    );
    const templates = await readFile(
      join(root, 'src/ui/templates.html'),
      'utf8',
    );
    const result = await pack({
      outputDirectory: temp,
      manifest: {
        format: 1,
        id,
        version: '1.0.2',
        entry: 'index.html',
        script: 'app.js',
        style: 'app.css',
        permissions: ['storage.read', 'storage.write', 'audio.webAudio'],
        assets: [atlasPath],
      },
      files: {
        'index.html': html + templates,
        'app.js': await readFile(join(web, 'app.js')),
        'app.css': await readFile(join(web, 'app.css')),
        'strings.json': '{}',
        [atlasPath]: await readFile(
          join(root, 'src/assets/characters/bean-mascots.webp'),
        ),
      },
    });
    await rename(result.file, join(output, 'app.zip'));
    log(`已生成 dist-mapp/app.zip（${result.size} 字节）`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

try {
  await buildMapp();
} catch (err) {
  error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
