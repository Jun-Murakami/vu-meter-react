import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// ライブラリビルド用のVite設定。
// - 例: `npm run build` で ESM/CJS 出力と型定義を生成
// - React/ReactDOM は外部化（使用側で解決）
export default defineConfig({
  plugins: [
    react(),
    // 型定義(d.ts)を自動生成。`dist/` に出力
    dts({
      include: ["src"],
      entryRoot: "src",
      tsconfigPath: "tsconfig.app.json",
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      // ライブラリエントリ
      entry: "src/index.ts",
      name: "VUMeterReact",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "index.mjs" : "index.cjs"),
    },
    sourcemap: true,
    rollupOptions: {
      // React は peer dependency 扱い
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
