/* Read-only baseline comparator for source-inspection tests. Never writes the checkout. */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const read = fs.readFileSync;
const root = path.resolve(__dirname, '..');
const previous = new Map(['Index.html','config.js','ui/ax.js','private-service-v1.js','sw.js','package.json'].map(file=>{
  const text=execFileSync('git',['show','c87236976c91137ceba299a084b835242c552ddb:'+file],{cwd:root,encoding:'utf8'});
  const current=read(path.join(root,file),'utf8');
  return [path.join(root,file),current.includes('\r\n')?text.replace(/\r?\n/g,'\r\n'):text];
}));
fs.readFileSync=function(file,options){
  const old=typeof file==='string'?previous.get(path.resolve(file)):undefined;
  if(old===undefined)return read.apply(this,arguments);
  const encoding=typeof options==='string'?options:options?.encoding;
  return encoding?old:Buffer.from(old);
};
