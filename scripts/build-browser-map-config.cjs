'use strict';
// Only the intentionally public, website-restricted Maps browser key is exported.
// Never fall back to GOOGLE_MAPS_API_KEY (the server credential).
const fs=require('node:fs'),path=require('node:path');
function configuration(env){return{browserKey:String(env.GOOGLE_MAPS_BROWSER_API_KEY||'').trim()};}
if(require.main===module){
  fs.writeFileSync(path.join(__dirname,'../browser-map-config.json'),JSON.stringify(configuration(process.env)));
  console.log('Browser map configuration generated. No credential values logged.');
}
module.exports={configuration};
