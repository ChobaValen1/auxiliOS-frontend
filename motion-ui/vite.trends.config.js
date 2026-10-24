import {defineConfig} from "vite";
import {fileURLToPath} from "node:url";
export default defineConfig({
 define:{"process.env.NODE_ENV":JSON.stringify("production")},
 build:{target:"es2020",outDir:"../ui/motion",emptyOutDir:false,
 lib:{entry:fileURLToPath(new URL("./src/trends.tsx",import.meta.url)),name:"AuxTrends",formats:["iife"],fileName:()=>"trends-v1.js",cssFileName:"trends-v1"},
 rollupOptions:{output:{assetFileNames:"[name][extname]"}}}
});
