import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  // 静态资源使用相对地址，兼容线上 /game/wallbait/ 子路径。
  base: './',
  plugins: [
    {
      name: 'wallbait-templates',
      transformIndexHtml: (html) =>
        html.replace('<!-- wallbait-templates -->', () =>
          readFileSync(
            new URL('./src/ui/templates.html', import.meta.url),
            'utf8',
          ),
        ),
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/playwright-report/**',
        '**/test-results/**',
        '**/docs/testing/evidence/**',
        '**/dist/**',
      ],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
