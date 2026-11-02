const {chromium}=require('playwright');const fs=require('fs');const OUT='/home/user/auxiliOS-frontend/entregables/marketing/creativos/';
const B64=(p,t)=>`data:${t};base64,`+fs.readFileSync(p).toString('base64');
const IMG={inicio:B64('/home/user/auxiliOS-frontend/assets/solo-landing/inicio.jpg','image/jpeg'),firma:B64('/home/user/auxiliOS-frontend/assets/solo-landing/firma.jpg','image/jpeg'),grua:B64(__dirname+'/demo2/grua.jpg','image/jpeg'),
 p1:B64(__dirname+'/pdf/prestadora-1.png','image/png'),p2:B64(__dirname+'/pdf/prestadora-2.png','image/png'),signup:B64(__dirname+'/auth2/movil-signup.png','image/png'),fact:B64('/home/user/auxiliOS-frontend/assets/solo-landing/facturacion.jpg','image/jpeg')};
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
const brand=`<div class="brand">AUXILI<b>OS</b><span>SOLO</span></div>`;
const page=(w,h,body)=>`<!doctype html><html><head><meta charset="utf-8">${css}</head><body style="width:${w}px;height:${h}px"><div class="glow"></div>${body}</body></html>`;
const head=(f,title,sub)=>f==='s'?`<div style="position:absolute;left:80px;right:80px;top:250px">${brand}<h1 style="margin-top:36px;font-size:124px">${title}</h1>${sub?`<p class="sub" style="margin-top:28px">${sub}</p>`:''}</div>`
  :`<div style="position:absolute;left:70px;right:70px;top:64px">${brand}<h1 style="margin-top:34px">${title}</h1>${sub?`<p class="sub" style="margin-top:22px;max-width:900px">${sub}</p>`:''}</div>`;
const ctaF=`<div style="position:absolute;left:70px;bottom:70px"><span class="cta">Probala gratis →</span></div>`;
const qr=w=>`<div style="position:relative">${crop(IMG.p2,910,512,367,337,129,w,'border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.5)')}<div style="position:absolute;left:${Math.round(14*w/337)}px;top:${Math.round(110*w/337)}px;width:${Math.round(205*w/337)}px;height:${Math.round(14*w/337)}px;background:#f5f6f8"></div></div>`;
const C={
 // ── BOFU ──
 'b1-empeza-5-minutos':f=>{const s=f==='s';const step=(n,t,d)=>`<div style="display:flex;gap:26px;align-items:flex-start;margin-bottom:${s?44:30}px"><div style="flex:none;width:${s?96:84}px;height:${s?96:84}px;border-radius:50%;background:#f5a623;color:#111;display:grid;place-items:center;font:400 ${s?62:54}px 'Bebas Neue'">${n}</div><div><div style="font:700 ${s?44:38}px 'DM Sans'">${t}</div><div style="font-size:${s?32:28}px;color:#9aa0ad;margin-top:6px">${d}</div></div></div>`;
   return head(f,'Empezá en <em>5 minutos.</em>',null)+`<div class="phone" style="position:absolute;${s?'left:50%;margin-left:-230px;width:460px;top:1380px':'right:60px;width:340px;top:680px;transform:rotate(4deg)'}"><img src="${IMG.firma}"></div><div style="position:absolute;left:${s?80:70}px;right:${s?80:390}px;top:${s?560:330}px">${step(1,'Creá tu cuenta','Con tu email o con Google. Un minuto.')}${step(2,'Cargá tu grúa y tu prestadora','La patente y con quién trabajás.')}${step(3,'Hacé tu primer remito','Fotos, firma y se lo mandás por WhatsApp.')}
   <div style="margin-top:${s?30:10}px;display:flex;align-items:center;gap:26px;flex-wrap:wrap"><span class="cta">Crear mi cuenta gratis →</span><span style="font-size:28px;color:#8a90a0">Sin tarjeta</span></div></div>`;},
 'b2-dudas':f=>{const s=f==='s';const qa=(q,a)=>`<div style="padding:${s?30:24}px ${s?34:28}px;border-radius:24px;background:#181c24;border:2px solid #262b36"><div style="font:700 ${s?38:33}px 'DM Sans'">${q}</div><div style="font-size:${s?32:28}px;color:#b9beca;margin-top:8px"><b style="color:#f5a623">${a[0]}</b> ${a[1]}</div></div>`;
   return head(f,'¿Y si…? <em>Te lo contestamos.</em>',null)+`<div style="position:absolute;left:${s?80:70}px;right:${s?80:70}px;top:${s?680:420}px;display:grid;gap:${s?22:16}px">
   ${qa('¿Cuánto cuesta?',['Nada.','Es gratis en la etapa de prueba, sin tarjeta.'])}${qa('¿Hay que instalar algo?',['No.','Se abre desde el celular y la dejás en la pantalla de inicio.'])}
   ${qa('¿Y si no tengo señal?',['Anda igual.','Se guarda y se sube cuando vuelve la conexión.'])}${qa('¿Y si me trabo?',['Te ayudamos.','Escribinos por WhatsApp desde la app.'])}</div>
   ${s?'':ctaF.replace('bottom:70px','bottom:56px')}`;},
 'b3-te-quedo-pendiente':f=>{const s=f==='s';return head(f,'Te quedó pendiente. <em>Es un minuto.</em>',s?'Tu cuenta gratis te espera. Entrá con Google y listo.':'Tu cuenta gratis te espera. Entrá con Google y listo.')+
   `<div class="phone" style="position:absolute;${s?'left:50%;margin-left:-260px;width:520px;top:900px':'right:70px;width:430px;top:520px;transform:rotate(-3deg)'}"><img src="${IMG.signup}"></div>
   ${s?'':`<div style="position:absolute;left:70px;top:620px;width:470px;display:grid;gap:18px"><div class="li"><i>✓</i>Gratis en la etapa de prueba</div><div class="li"><i>✓</i>Sin tarjeta</div><div class="li"><i>✓</i>Con Google, sin contraseña</div></div>`}${s?'':ctaF.replace('Probala gratis','Terminar mi cuenta')}`;},
 'b4-te-ayudamos':f=>{const s=f==='s';return head(f,'No estás solo. <em>Te ayudamos a arrancar.</em>',s?'Si te trabás cargando tu grúa o tu primera prestadora, nos escribís por WhatsApp desde la app.':'¿Te trabás? Nos escribís por WhatsApp desde la app.')+
   `<div style="position:absolute;left:${s?200:300}px;right:${s?80:70}px;top:${s?820:480}px" class="wa-out">Hola, ¿cómo cargo la tarifa de mi prestadora?</div>
   <div style="position:absolute;left:${s?80:70}px;right:${s?200:300}px;top:${s?1010:640}px" class="wa-in"><b>AuxiliOS Solo · Soporte</b>¡Hola! Entrá a Más → Prestadoras, elegila y tocá «Agregar tarifa». Si querés, la cargamos juntos 👍</div>
   <span class="pill" style="position:absolute;background:#12261b;border:2px solid #34c77b;color:#34c77b;${s?'left:80px;top:1420px':'left:70px;top:960px'}">💬 Ayuda por WhatsApp, de una persona</span>
   ${s?'':ctaF}<span class="note">Conversación de ejemplo</span>`;},
 // ── MOFU · carrusel cómo funciona ──
 'm1-como-funciona-1':f=>carr(1,'Cargás el servicio.','El precio sale solo, con la tarifa de tu prestadora.',`<div style="width:820px;background:#181c24;border:2px solid #262b36;border-radius:30px;padding:34px 40px;font-size:36px">
   <div style="display:flex;justify-content:space-between;margin-bottom:22px"><b>Base remolque</b><span style="font-family:'DM Mono'">$ 110.000</span></div><div style="display:flex;justify-content:space-between;margin-bottom:22px"><b>16 km de más</b><span style="font-family:'DM Mono'">$ 16.000</span></div>
   <div style="display:flex;justify-content:space-between;padding-top:22px;border-top:2px solid #262b36;font-size:44px"><span style="color:#9aa0ad">Total</span><span style="font-family:'DM Mono';color:#f5a623">$ 126.000</span></div></div>`),
 'm1-como-funciona-2':f=>carr(2,'Fotos y firma.','El socio firma con el dedo en tu celular.',`<div style="display:flex;gap:24px;align-items:center">${crop(IMG.firma,780,32,580,716,770,380,'border-radius:26px;box-shadow:0 24px 60px rgba(0,0,0,.5)')}<div style="display:grid;gap:16px">${crop(IMG.p1,910,70,849,166,125,300,'border-radius:16px')}${crop(IMG.p1,910,472,849,166,125,300,'border-radius:16px')}</div></div>`),
 'm1-como-funciona-3':f=>carr(3,'Lo mandás por WhatsApp.','Con un toque: PDF con tu logo y QR.',`<div class="wa-out" style="width:760px;font-size:32px">Hola Lucía, te envío el remito N.º 12 del servicio del 24/11 (patente AE 610 BC). Grúas Gómez.<div style="margin-top:16px;border-radius:14px;background:rgba(0,0,0,.25);padding:16px;font-size:26px;color:#9fe1d1">📄 Descargalo acá: …/remito-12.pdf</div><div style="text-align:right;color:#53bdeb;font-size:24px;margin-top:8px">✓✓</div></div>`),
 'm1-como-funciona-4':f=>carr(4,'Ves cuánto te queda.','Facturado, gastado y lo que le facturás a cada prestadora.',`${crop(IMG.inicio,780,32,498,716,290,820,'border-radius:28px;box-shadow:0 24px 60px rgba(0,0,0,.5)')}`,true),
};
function carr(n,t,sub,vis,last){return `<div style="position:absolute;left:80px;right:80px;top:80px"><span class="pill" style="background:rgba(245,166,35,.16);color:#f5a623;box-shadow:none">Paso ${n} de 4</span><h1 style="margin-top:28px;font-size:100px">${t}</h1><p class="sub" style="margin-top:14px">${sub}</p></div>
  <div style="position:absolute;left:0;right:0;top:${last?560:540}px;display:flex;justify-content:center">${vis}</div>
  ${last?`<div style="position:absolute;left:80px;bottom:60px;display:flex;align-items:center;gap:24px"><span class="cta" style="font-size:32px;padding:20px 34px">Probala gratis →</span></div>`:`<div style="position:absolute;right:70px;bottom:50px;font:700 28px 'DM Sans';color:#8a90a0">Deslizá →</div>`}<span class="note">Datos de ejemplo</span>`;}

(async()=>{const b=await chromium.launch();const only=process.argv[2];
 for(const [n,fn] of Object.entries(C)){if(only&&!n.startsWith(only))continue;for(const [f,w,h,suf] of (n.startsWith('m1')?[['c',1080,1080,'1x1']]:[['f',1080,1350,'4x5'],['s',1080,1920,'9x16']])){const p=await b.newPage({viewport:{width:w,height:h}});
  await p.setContent(page(w,h,fn(f)),{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(250);await p.screenshot({path:OUT+n+'-'+suf+'.jpg',type:'jpeg',quality:88});await p.close();}console.log('ok',n);}
 await b.close();})();
