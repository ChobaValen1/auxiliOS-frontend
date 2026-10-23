import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    target: 'es2020', outDir: '../ui/motion', emptyOutDir: false,
    lib: { entry: fileURLToPath(new URL('./src/efficiency.tsx', import.meta.url)), name: 'AuxEfficiency', formats: ['iife'], fileName: () => 'efficiency-v1.js', cssFileName: 'efficiency-v1' },
    rollupOptions: { output: { assetFileNames: '[name][extname]' } }
  }
});
