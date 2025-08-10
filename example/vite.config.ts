import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// example アプリ用の Vite 設定
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  server: {
    port: 5174,
  },
  resolve: {
    alias: {
      // ローカルのライブラリを直接参照
      'vu-meter-react': path.resolve(__dirname, '../src'),
    },
  },
});
