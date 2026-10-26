// Browser check with synthetic data; no backend requests.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
const page=await browser.newPage();await page.setContent('<html><body></body></html>');
const source=fs.readFileSync(path.resolve(__dirname,'../../company-billing-parameters-v4.js'),'utf8').replace('window.AuxiliosBillingParametersV4=', 'window.kmQA={modalHtml,bindModal,readForm,payloadFrom,goStep};window.AuxiliosBillingParametersV4=');
await page.addScriptTag({content:source});await page.evaluate(()=>{const api=window.AuxiliosBillingParametersV4;api.state.companyId='synthetic';api.state.billing={setting:{km_rounding_mode:'decimal'},bases:[],available_bases:[]};document.getElementById('bp4-modal-body').innerHTML=window.kmQA.modalHtml();window.kmQA.bindModal();window.kmQA.goStep(2);});
assert.equal(await page.locator('#bp4-km-rounding').inputValue(),'decimal');
for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.locator('#bp4-km-rounding').selectOption('nearest_integer');assert.match(await page.locator('#bp4-km-rounding-help').innerText(),/90,5 → 91/);assert.match(await page.locator('#bp4-km-rounding-help').innerText(),/por separado/);const payload=await page.evaluate(()=>window.kmQA.payloadFrom(window.kmQA.readForm()));assert.equal(payload.km_rounding_mode,'nearest_integer');assert.equal(payload.km_rounding_scope,'per_terrain');}
console.log('Kilometres configuration browser check: desktop and mobile OK');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
