const {chromium}=require('playwright');const fs=require('fs');const OUT='/home/user/auxiliOS-frontend/entregables/marketing/fanpage/';
const B64=(p,t)=>`data:${t};base64,`+fs.readFileSync(p).toString('base64');
const IMG={inicio:B64('/home/user/auxiliOS-frontend/assets/solo-landing/inicio.jpg','image/jpeg'),firma:B64('/home/user/auxiliOS-frontend/assets/solo-landing/firma.jpg','image/jpeg'),grua:B64(__dirname+'/demo2/grua.jpg','image/jpeg'),
 p1:B64(__dirname+'/pdf/prestadora-1.png','image/png'),p2:B64(__dirname+'/pdf/prestadora-2.png','image/png'),logo:B64('/home/user/auxiliOS-frontend/assets/icons/icon-512.png','image/png')};
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
const card=(inner,st='')=>`<div style="background:#181c24;border:2px solid #262b36;border-radius:28px;padding:28px 32px;${st}">${inner}</div>`;
const chk=(t,d)=>`<div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:22px"><div style="flex:none;width:52px;height:52px;border-radius:14px;border:3px solid #f5a623;display:grid;place-items:center;color:#f5a623;font:700 30px 'DM Sans'">✓</div><div><div style="font:700 36px 'DM Sans'">${t}</div>${d?`<div style="font-size:28px;color:#9aa0ad;margin-top:4px">${d}</div>`:''}</div></div>`;
const foot=`<div style="position:absolute;left:70px;right:70px;bottom:46px;display:flex;justify-content:space-between;align-items:center">${brand}<span style="font:700 26px 'DM Sans';color:#8a90a0">Guardalo 📌</span></div>`;
const C={
 'p1-hola':()=>`<div style="position:absolute;left:70px;right:70px;top:80px"><img src="${IMG.logo}" style="width:150px;border-radius:34px;box-shadow:0 16px 40px rgba(0,0,0,.5)"><h1 style="margin-top:40px;font-size:128px">Hola, somos <em>AuxiliOS Solo.</em></h1>
   <p class="sub" style="margin-top:26px;max-width:560px">La app para el gruero que trabaja solo: servicios por prestadora, gastos, remitos con fotos y firma, y lo que te queda del mes.</p></div>
   <div class="phone" style="position:absolute;right:60px;bottom:-200px;width:390px;transform:rotate(-4deg)"><img src="${IMG.inicio}"></div>
   <div style="position:absolute;left:70px;bottom:80px;display:grid;gap:14px">${['Remitos digitales','Servicios por prestadora','Gastos y ganancia','Tu grúa al día'].map(x=>`<span class="pill" style="background:#181c24;border:2px solid #262b36;box-shadow:none;font-size:28px">✓ ${x}</span>`).join('')}</div>`,
 'p2-fotos-antes-de-cargar':()=>{const ph=(x,l)=>`<div>${crop(IMG.p1,910,x,849,166,125,380,'border-radius:20px')}<div style="font:700 30px 'DM Sans';margin-top:12px">${l}</div></div>`;
   return `<div style="position:absolute;left:70px;right:70px;top:70px"><span class="pill" style="background:rgba(245,166,35,.16);color:#f5a623;box-shadow:none">Tip de laburo</span><h1 style="margin-top:26px;font-size:104px">4 fotos que conviene sacar <em>antes de cargar el auto.</em></h1></div>
   <div style="position:absolute;left:70px;right:70px;top:470px;display:grid;grid-template-columns:380px 380px;justify-content:center;gap:24px 40px">${ph(70,'1 · Frente')}${ph(270,'2 · Lateral')}${ph(472,'3 · Daños que ya tenía')}${ph(674,'4 · Odómetro')}</div>
   <p class="sub" style="position:absolute;left:70px;right:70px;bottom:130px;font-size:32px">Si después hay un reclamo, tenés con qué responder.</p>${foot}<span class="note" style="bottom:12px">Fotos de ejemplo</span>`;},
 'p3-lo-que-te-deja':()=>{const r=(l,v,c='#eef0f4',b='')=>`<div style="display:flex;justify-content:space-between;font-size:40px;padding:14px 0;${b}"><span>${l}</span><span style="font-family:'DM Mono';color:${c}">${v}</span></div>`;
   return `<div style="position:absolute;left:70px;right:70px;top:70px"><span class="pill" style="background:rgba(245,166,35,.16);color:#f5a623;box-shadow:none">Números</span><h1 style="margin-top:26px">Lo que cobrás <em>no es lo que ganás.</em></h1><p class="sub" style="margin-top:18px">Cuánto te deja de verdad un servicio:</p></div>
   <div style="position:absolute;left:70px;right:70px;top:440px">${card(r('Cobraste el servicio','$ 126.000','#34c77b')+r('− Gasoil','$ 28.000','#ef6b6b')+r('− Peajes','$ 3.200','#ef6b6b')+r('− Comida en la ruta','$ 7.500','#ef6b6b')+r('Te quedó','$ 87.300','#f5a623','border-top:2px solid #262b36;margin-top:10px;padding-top:24px;font-weight:700'))}
   <p class="sub" style="margin-top:28px;font-size:32px">Y falta repartir los fijos del mes: seguro, cuota de la grúa y monotributo.</p></div>${foot}<span class="note" style="bottom:12px">Números de ejemplo</span>`;},
 'p4-checklist-grua':()=>`<div style="position:absolute;left:70px;right:70px;top:70px"><span class="pill" style="background:rgba(245,166,35,.16);color:#f5a623;box-shadow:none">Checklist</span><h1 style="margin-top:26px">Lo que no se te puede <em>vencer.</em></h1></div>
   <div style="position:absolute;left:70px;right:70px;top:470px">${chk('Seguro de la grúa','Fijate la fecha en la póliza.')}${chk('VTV','Y la oblea a la vista.')}${chk('Habilitación','La del municipio o la que te pida la prestadora.')}${chk('Service','Cada tantos km, según el manual.')}${chk('Cubiertas','Desgaste parejo y la de auxilio inflada.')}${chk('Matafuego','Cargado y con la tarjeta al día.')}</div>${foot}`,
 'p6-pregunta':()=>{const o=(l,t)=>`<div style="display:flex;gap:22px;align-items:center;padding:24px 28px;border-radius:24px;background:#181c24;border:2px solid #262b36"><span style="flex:none;width:64px;height:64px;border-radius:50%;background:#f5a623;color:#111;display:grid;place-items:center;font:400 44px 'Bebas Neue'">${l}</span><span style="font:700 38px 'DM Sans'">${t}</span></div>`;
   return `<div style="position:absolute;left:70px;right:70px;top:80px"><span class="pill" style="background:rgba(245,166,35,.16);color:#f5a623;box-shadow:none">Pregunta para grueros</span><h1 style="margin-top:26px">Además de manejar, <em>¿qué es lo que más te complica?</em></h1></div>
   <div style="position:absolute;left:70px;right:70px;top:590px;display:grid;gap:20px">${o('A','Los remitos y los papeles')}${o('B','Cobrarle a las prestadoras')}${o('C','Saber cuánto gané en el mes')}${o('D','Los vencimientos de la grúa')}</div>
   <div style="position:absolute;left:70px;right:70px;bottom:60px;display:flex;justify-content:space-between;align-items:center">${brand}<span style="font:700 32px 'DM Sans';color:#f5a623">Comentá con la letra 👇</span></div>`;},
 'perfil':()=>`<div style="position:absolute;inset:0;display:grid;place-items:center;background:#0c0e12"><img src="${IMG.logo}" style="width:860px;border-radius:180px"></div>`,
 'portada':()=>`<div style="position:absolute;left:120px;top:150px;width:900px">${brand.replace('class="brand"','class="brand" style="font-size:60px"')}<h1 style="margin-top:26px;font-size:120px">El control de tu grúa, <em>en una app.</em></h1><p class="sub" style="margin-top:22px">Remitos con fotos y firma · servicios por prestadora · gastos</p></div>
   <div class="phone" style="position:absolute;right:300px;top:90px;width:300px;transform:rotate(-6deg)"><img src="${IMG.firma}"></div><div class="phone" style="position:absolute;right:70px;top:150px;width:300px;transform:rotate(5deg)"><img src="${IMG.inicio}"></div>`,
 'p7-remito-completo':()=>`<div style="position:absolute;left:70px;right:70px;top:70px"><span class="pill" style="background:rgba(245,166,35,.16);color:#f5a623;box-shadow:none">Tip de laburo</span><h1 style="margin-top:26px;font-size:104px">Qué tiene que tener <em>un remito completo.</em></h1></div>
   <div style="position:absolute;left:70px;width:560px;top:500px">${chk('Fecha y hora')}${chk('Patente y vehículo')}${chk('Desde, hasta y km')}${chk('Firma y aclaración','Con el DNI de quien firma.')}${chk('Fotos del vehículo','Antes de cargarlo.')}${chk('Adicionales','Peajes, espera, km de más.')}</div>
   <div class="paper" style="position:absolute;right:50px;top:560px;transform:rotate(4deg)">${crop(IMG.p1,910,0,0,910,1000,380)}</div>${foot}<span class="note" style="bottom:12px">Remito de ejemplo</span>`,
};

(async()=>{const b=await chromium.launch();const only=process.argv[2];
 for(const [n,fn] of Object.entries(C)){if(only&&!n.startsWith(only))continue;for(const [f,w,h,suf] of (n==='perfil'?[['f',1080,1080,'']]:n==='portada'?[['f',1640,624,'']]:[['f',1080,1350,'4x5']])){const p=await b.newPage({viewport:{width:w,height:h}});
  await p.setContent(page(w,h,fn(f)),{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(250);await p.screenshot({path:OUT+n+'.jpg',type:'jpeg',quality:88});await p.close();}console.log('ok',n);}
 await b.close();})();
