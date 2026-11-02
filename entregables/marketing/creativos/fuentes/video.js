const {chromium}=require('playwright');const fs=require('fs');const [html,dir,secs]=process.argv.slice(2);
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});await p.goto('file://'+html);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
 fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});const N=Math.round(secs*30);
 for(let f=0;f<N;f++){await p.evaluate(t=>render(t),f/30);await p.screenshot({path:`${dir}/f${String(f).padStart(4,'0')}.jpg`,type:'jpeg',quality:92});}
 await b.close();console.log('frames',N);})();
