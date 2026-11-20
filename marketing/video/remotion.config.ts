/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import path from "path";
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// Todo `import … from "remotion"` pasa por el adaptador de tiempo (src/timescale/remotion-shim.tsx),
// que permite renderizar a 60 fps las composiciones pensadas a 30 fps. Con escala 1 no cambia nada.
Config.overrideBundlerConfig((config) => {
  const alias = { ...((config.resolve?.alias as Record<string, string>) ?? {}) };
  // Remotion ya apunta «remotion» a su build ESM; ese mismo archivo pasa a ser «remotion-real».
  const real = alias.remotion ?? path.join(process.cwd(), "node_modules/remotion/dist/esm/index.mjs");
  delete alias.remotion;
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...alias,
        remotion$: path.join(process.cwd(), "src/timescale/remotion-shim.tsx"),
        "remotion-real": real,
      },
    },
  };
});
