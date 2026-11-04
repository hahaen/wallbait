import { defineConfig } from 'vite';

export default defineConfig({
  // 静态资源使用相对地址，兼容未来的 GitHub Pages /wallbait/ 子路径。
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
