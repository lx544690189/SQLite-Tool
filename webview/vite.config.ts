import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Webview 产物输出到 media/，使用相对路径便于宿主 asWebviewUri 重写
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 19753,
    strictPort: true,
    cors: true,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
  },
  build: {
    outDir: resolve(__dirname, '../media'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // 固定入口产物名，便于宿主 HTML 引用
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
