import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      'vu-meter-react': path.resolve(__dirname, '../src'),
    },
  },
});
