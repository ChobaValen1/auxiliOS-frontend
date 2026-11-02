const {chromium}=require('playwright');const fs=require('fs');const OUT='/home/user/auxiliOS-frontend/entregables/marketing/creativos/';
const B64=(p,t)=>`data:${t};base64,`+fs.readFileSync(p).toString('base64');
const IMG={inicio:B64('/home/user/auxiliOS-frontend/assets/solo-landing/inicio.jpg','image/jpeg'),firma:B64('/home/user/auxiliOS-frontend/assets/solo-landing/firma.jpg','image/jpeg'),grua:B64(__dirname+'/demo2/grua.jpg','image/jpeg'),
 p1:B64(__dirname+'/pdf/prestadora-1.png','image/png'),p2:B64(__dirname+'/pdf/prestadora-2.png','image/png')};
// recorte de una imagen (coordenadas en px de la imagen original de ancho W)
const crop=(src,W,x,y,w,h,tw,style='')=>{const k=tw/w;return `<div style="width:${tw}px;height:${Math.round(h*k)}px;overflow:hidden;position:relative;${style}"><img src="${src}" style="position:absolute;left:${-Math.round(x*k)}px;top:${-Math.round(y*k)}px;width:${Math.round(W*k)}px;max-width:none"></div>`;};
const css=`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Caveat:wght@600;700&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap"><style>
*{box-sizing:border-box;margin:0}body{background:#0c0e12;color:#eef0f4;font-family:'DM Sans';overflow:hidden;position:relative}
.glow{position:absolute;inset:0;background:radial-gradient(60% 45% at 50% 35%,rgba(245,166,35,.2),transparent 70%)}
.brand{font:400 50px/1 'Bebas Neue';letter-spacing:.04em}.brand b{color:#f5a623;font-weight:400}.brand span{font-size:24px;letter-spacing:.22em;color:#8a90a0;margin-left:8px}
h1{font:400 112px/.92 'Bebas Neue';letter-spacing:.01em}h1 em{font-style:normal;color:#f5a623}
.sub{font-size:38px;line-height:1.3;color:#b9beca}.sub b{color:#fff}
.cta{display:inline-flex;align-items:center;gap:14px;background:#f5a623;color:#111;font:700 38px 'DM Sans';padding:24px 42px;border-radius:24px}
.phone{border-radius:64px;padding:14px;background:linear-gradient(160deg,#2a2e37,#121419);box-shadow:0 40px 100px rgba(0,0,0,.6),inset 0 0 0 2px rgba(255,255,255,.08)}.phone img{display:block;width:100%;border-radius:52px}
.callout{position:absolute;display:inline-flex;align-items:center;gap:12px;padding:16px 24px;border-radius:18px;background:#181c24;border:2px solid #f5a623;font:700 28px 'DM Sans';box-shadow:0 16px 40px rgba(0,0,0,.5);white-space:nowrap}
.callout i{font-style:normal;width:36px;height:36px;border-radius:50%;background:#f5a623;color:#111;display:grid;place-items:center;font-size:22px}
.paper{box-shadow:0 30px 80px rgba(0,0,0,.6);border-radius:14px;overflow:hidden;background:#fff}
.wa-in{border-radius:4px 22px 22px 22px;background:#202c33;padding:22px 26px;font-size:34px;line-height:1.35;color:#e9edef;box-shadow:0 16px 40px rgba(0,0,0,.4)}.wa-in b{display:block;font-size:24px;color:#53bdeb;margin-bottom:6px}
.wa-out{border-radius:22px 4px 22px 22px;background:#005c4b;padding:22px 26px;font-size:30px;line-height:1.35;color:#e9edef;box-shadow:0 16px 40px rgba(0,0,0,.4)}
.pill{display:inline-flex;align-items:center;gap:12px;padding:16px 26px;border-radius:99px;font:700 28px 'DM Sans';box-shadow:0 16px 40px rgba(0,0,0,.5);white-space:nowrap}
.li{display:flex;gap:16px;align-items:center;font-size:36px;margin-bottom:22px}.li i{flex:none;width:48px;height:48px;border-radius:50%;background:#f5a623;color:#111;display:grid;place-items:center;font-style:normal;font-weight:700;font-size:28px}
.note{position:absolute;right:40px;bottom:26px;font-size:20px;color:#5d6371}
.nb{position:relative;border-radius:16px;background:#efe7d2 repeating-linear-gradient(#efe7d2 0 42px,#c9d3e0 42px 44px);color:#2b3a67;font:700 32px/44px 'Caveat';padding:8px 22px 8px 62px;box-shadow:0 20px 50px rgba(0,0,0,.5);white-space:nowrap}
.nb::before{content:"";position:absolute;left:42px;top:0;bottom:0;width:3px;background:#e7a0a0}.nb .q{color:#c0392b}
.tk{background:#f7f5ef;color:#333;font:500 20px/1.5 'DM Mono';padding:18px 20px;box-shadow:0 16px 40px rgba(0,0,0,.5);clip-path:polygon(0 0,100% 0,100% 94%,90% 100%,80% 94%,70% 100%,60% 94%,50% 100%,40% 94%,30% 100%,20% 94%,10% 100%,0 94%)}
</style>`;
const brand=`<div class="brand">AUXILI<b>OS</b></div>`;
const page=(w,h,body)=>`<!doctype html><html><head><meta charset="utf-8">${css}</head><body style="width:${w}px;height:${h}px"><div class="glow"></div>${body}</body></html>`;
const head=(f,title,sub)=>f==='s'?`<div style="position:absolute;left:80px;right:80px;top:250px">${brand}<h1 style="margin-top:36px;font-size:124px">${title}</h1>${sub?`<p class="sub" style="margin-top:28px">${sub}</p>`:''}</div>`
  :`<div style="position:absolute;left:70px;right:70px;top:64px">${brand}<h1 style="margin-top:34px">${title}</h1>${sub?`<p class="sub" style="margin-top:22px;max-width:900px">${sub}</p>`:''}</div>`;
const ctaF=`<div style="position:absolute;left:70px;bottom:70px"><span class="cta">Probala gratis →</span></div>`;
const qr=w=>`<div style="position:relative">${crop(IMG.p2,910,512,367,337,129,w,'border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.5)')}<div style="position:absolute;left:${Math.round(14*w/337)}px;top:${Math.round(110*w/337)}px;width:${Math.round(205*w/337)}px;height:${Math.round(14*w/337)}px;background:#f5f6f8"></div></div>`;
const C={
 'a6-tu-marca':f=>{const s=f==='s';const pw=s?820:700;return head(f,'Un remito que <em>da gusto mandar.</em>',s?'Tu logo, tu CUIT, fotos y firma. Con QR para verificar que es original.':'Tu logo, tu CUIT, fotos, firma y un QR que lo valida.')+
   `<div class="paper" style="position:absolute;left:${s?130:70}px;top:${s?900:470}px;transform:rotate(-3deg)">${crop(IMG.p1,910,0,0,910,s?1010:1000,pw)}</div>
   <div style="position:absolute;right:${s?60:50}px;top:${s?1380:840}px;transform:rotate(3deg)">${qr(s?430:380)}</div>
   <span class="callout" style="left:${s?330:270}px;top:${s?1010:575}px"><i>✓</i>Tu logo y tu CUIT</span>
   <span class="callout" style="left:${s?90:50}px;top:${s?1560:1160}px"><i>✓</i>Fotos del vehículo</span>
   <span class="callout" style="right:${s?90:70}px;top:${s?1300:765}px"><i>✓</i>QR que lo valida</span><span class="note">Datos de ejemplo</span>`;},
 'a7-reclamo':f=>{const s=f==='s';return head(f,'Si el socio reclama, <em>las fotos te cubren.</em>',null)+
   `<div style="position:absolute;left:${s?80:70}px;right:${s?200:260}px;top:${s?690:420}px" class="wa-in"><b>Socio · AE 456 KJ</b>¡El auto tiene un golpe que antes no tenía! 😡</div>
   <div style="position:absolute;left:${s?200:280}px;right:${s?80:70}px;top:${s?930:625}px" class="wa-out">Antes de cargarlo sacamos esta foto, y firmaste “sin daños” 👇
     <div style="display:flex;gap:16px;margin-top:18px">${crop(IMG.p1,910,472,849,166,125,s?330:300,'border-radius:14px')}${crop(IMG.p1,910,270,849,166,125,s?330:300,'border-radius:14px')}</div></div>
   <div style="position:absolute;left:${s?80:70}px;top:${s?1400:1035}px;background:#fff;border-radius:18px;padding:18px 22px;box-shadow:0 16px 40px rgba(0,0,0,.5)">${crop(IMG.p2,910,58,196,400,38,s?600:520)}</div>
   ${s?'':ctaF.replace('left:70px','right:70px;left:auto')}<span class="note">Datos de ejemplo</span>`;},
 'a8-vencimientos':f=>{const s=f==='s';return head(f,'El seguro no avisa cuando vence. <em>La app sí.</em>',s?'Seguro, VTV y habilitación con aviso 15 días antes. El service, por km.':'Seguro, VTV y habilitación: aviso 15 días antes.')+
   `<div class="phone" style="position:absolute;${s?'left:50%;margin-left:-270px;width:540px;top:980px':'right:70px;width:470px;top:560px;transform:rotate(-3deg)'}"><img src="${IMG.grua}"></div>
   <span class="pill" style="position:absolute;background:#2a2213;border:2px solid #f5a623;color:#f5a623;${s?'left:90px;top:1300px':'left:70px;top:720px'}">⏰ Seguro · vence en 9 días</span>
   <span class="pill" style="position:absolute;background:#12261b;border:2px solid #34c77b;color:#34c77b;${s?'right:90px;top:1420px':'left:70px;top:830px'}">✓ VTV · al día</span>
   ${s?'':ctaF}<span class="note">Datos de ejemplo</span>`;},
 'a9-sin-senal':f=>{const s=f==='s';return head(f,'Sin señal en la ruta. <em>La app sigue andando.</em>',s?'Lo que cargás se guarda en el celular y se sube solo cuando vuelve la conexión.':'Se guarda en el celular y se sube cuando vuelve la señal.')+
   `<div class="phone" style="position:absolute;${s?'left:50%;margin-left:-270px;width:540px;top:1000px':'right:70px;width:470px;top:600px;transform:rotate(3deg)'}"><img src="${IMG.firma}"></div>
   <span class="pill" style="position:absolute;background:#2a1717;border:2px solid #ef6b6b;color:#ef6b6b;${s?'left:80px;top:1250px':'left:70px;top:760px'}">📵 Sin conexión · guardado</span>
   <span class="pill" style="position:absolute;background:#12261b;border:2px solid #34c77b;color:#34c77b;${s?'right:80px;top:1380px':'left:70px;top:870px'}">✓ Se subió con señal</span>
   ${s?'':ctaF}`;},
 'a10-fundador':f=>{const s=f==='s';return `<div style="position:absolute;left:${s?80:70}px;right:${s?80:70}px;top:${s?250:70}px">${brand}<h1 style="margin-top:36px;font-size:${s?150:124}px">Buscamos grueros <em>fundadores.</em></h1>
   <div style="margin-top:${s?60:40}px"><div class="li"><i>✓</i>Gratis en la etapa de prueba</div><div class="li"><i>✓</i>Sin tarjeta</div><div class="li"><i>✓</i>Contanos qué te falta y lo tenemos en cuenta</div></div>
   <span class="cta" style="margin-top:${s?30:16}px">Sumate gratis →</span></div>
   <div class="phone" style="position:absolute;${s?'left:50%;margin-left:-250px;width:500px;top:1240px':'right:60px;width:360px;top:830px;transform:rotate(-5deg)'}"><img src="${IMG.inicio}"></div>`;},
 'a11-mesa':f=>{const s=f==='s';const nb=`<div class="nb" style="width:${s?470:430}px;transform:rotate(-4deg)"><div>Asist. Ruta 85.000 <span class="q">¿?</span></div><div>Sur 46.000 <span class="q">¿+km?</span></div><div>gasoil 61.000</div><div>me queda = <span class="q">???</span></div></div>`;
   const tk=(r,t)=>`<div class="tk" style="width:230px;transform:rotate(${r}deg)">${t}</div>`;
   return head(f,'Cuaderno, talonario, tickets… <em>o una sola app.</em>',null)+
   `<div style="position:absolute;left:${s?60:50}px;top:${s?820:470}px">${nb}</div>
   <div style="position:absolute;left:${s?120:90}px;top:${s?1080:720}px">${tk(6,'YPF · GASOIL<br>61,4 L<br>$ 61.000')}</div>
   <div style="position:absolute;left:${s?330:290}px;top:${s?1140:770}px">${tk(-8,'PEAJE<br>RICCHERI<br>$ 1.600')}</div>
   <div style="position:absolute;left:${s?140:90}px;top:${s?1420:1010}px;width:${s?380:340}px;height:150px;border-radius:10px;background:#d9e6f2;transform:rotate(3deg);box-shadow:0 16px 40px rgba(0,0,0,.5);font:700 26px 'DM Sans';color:#555;padding:18px 22px;filter:saturate(.7)">TALONARIO REMITOS<br><span style="font:700 34px 'Caveat';color:#33427a">N.º 0041 · 0042 · 0043…</span></div>
   <div style="position:absolute;left:${s?520:470}px;top:${s?1180:780}px;font:400 120px 'Bebas Neue';color:#f5a623">→</div>
   <div class="phone" style="position:absolute;${s?'right:50px;width:420px;top:900px':'right:50px;width:380px;top:470px'}"><img src="${IMG.inicio}"></div>
   ${s?'':ctaF.replace('left:70px','right:70px;left:auto').replace('bottom:70px','bottom:50px')}<span class="note">Datos de ejemplo</span>`;},
};
(async()=>{const b=await chromium.launch();const only=process.argv[2];
 for(const [n,fn] of Object.entries(C)){if(only&&!n.startsWith(only))continue;for(const [f,w,h,suf] of [['f',1080,1350,'4x5'],['s',1080,1920,'9x16']]){const p=await b.newPage({viewport:{width:w,height:h}});
  await p.setContent(page(w,h,fn(f)),{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(250);await p.screenshot({path:OUT+n+'-'+suf+'.jpg',type:'jpeg',quality:88});await p.close();}console.log('ok',n);}
 await b.close();})();
