import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    target: 'es2020', outDir: '../ui/motion', emptyOutDir: false,
    lib: { entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)), name: 'AuxiliosMotion', formats: ['iife'], fileName: () => 'motion-v1.js', cssFileName: 'motion-v1' },
    rollupOptions: { output: { assetFileNames: '[name][extname]' } }
  }
});
