/* QA ONLY: deterministic SDK double. Never loaded by the application. */
(()=>{
  const ns='http://www.w3.org/2000/svg',svg=name=>document.createElementNS(ns,name);
  const state=window.__mapMock={instances:[],updates:0};
  class LatLng{constructor(lat,lng){this.latValue=lat;this.lngValue=lng;}}
  class Bounds{constructor(){this.points=[];}extend(p){this.points.push(p);return this;}}
  class MockMap{
    constructor(el,options){this.el=el;this.options=options;this.listeners={};this.overlays=[];this.paths=[];this.el.innerHTML='';this.el.style.background='#192530';this.canvas=svg('svg');this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%';this.el.append(this.canvas);this.pane=document.createElement('div');this.pane.style.cssText='position:absolute;inset:0;pointer-events:none';this.el.append(this.pane);const label=document.createElement('small');label.textContent='Mapa simulado · Datos de prueba';label.style.cssText='position:absolute;bottom:4px;left:12px;color:#b7c3d0;font:10px system-ui';this.el.append(label);this.setOptions(options);state.instances.push(this);}
    setOptions(options){Object.assign(this.options,options);this.el.style.background=options.styles?.length>2?'#192530':'#e2e8ef';}
    addListener(name,fn){this.listeners[name]=fn;return{remove:()=>delete this.listeners[name]};}
    fitBounds(bounds,padding){this.bounds=bounds;this.padding=padding;this.canvas.replaceChildren();for(let i=1;i<12;i++){for(const diagonal of [false,true]){const line=svg('path');line.setAttribute('d',diagonal?`M${i*100-450},0 l650,900`:`M0,${i*70} l1200,-280`);line.setAttribute('stroke','#526577');line.setAttribute('stroke-width',i%3===0?'2':'1');line.setAttribute('opacity','.22');this.canvas.append(line);}}this.overlays.forEach(o=>o.draw());}
    project(p){const points=this.bounds.points,minLat=Math.min(...points.map(p=>p.lat)),maxLat=Math.max(...points.map(p=>p.lat)),minLng=Math.min(...points.map(p=>p.lng)),maxLng=Math.max(...points.map(p=>p.lng));return{x:55+(p.lng-minLng)/Math.max(.001,maxLng-minLng)*(this.el.clientWidth-110),y:55+(maxLat-p.lat)/Math.max(.001,maxLat-minLat)*(this.el.clientHeight-110)};}
  }
  class Overlay{
    setMap(map){if(this.map){this.onRemove();this.map.overlays=this.map.overlays.filter(x=>x!==this);}this.map=map;if(map){map.overlays.push(this);this.onAdd();this.button.style.pointerEvents='auto';this.draw();}}
    getPanes(){return{overlayMouseTarget:this.map.pane};}
    getProjection(){return{fromLatLngToDivPixel:p=>this.map.project({lat:p.latValue,lng:p.lngValue})};}
    static preventMapHitsAndGesturesFrom(){}
  }
  class Polyline{
    constructor(options){this.options=options;this.map=options.map;this.path=svg('path');this.path.setAttribute('fill','none');this.path.setAttribute('stroke',options.strokeColor);this.path.setAttribute('stroke-width',options.strokeWeight);if(options.icons)this.path.setAttribute('stroke-dasharray','7 7');this.map.canvas.append(this.path);this.map.paths.push(this);}
    setPath(points){this.points=points;state.updates++;if(!this.map)return;this.path.setAttribute('d',points.map((p,i)=>{const v=this.map.project(p);return(i?'L':'M')+v.x+','+v.y;}).join(' '));}
    setMap(map){this.map=map;if(!map)this.path.remove();}
  }
  window.google={maps:{Map:MockMap,LatLng,LatLngBounds:Bounds,OverlayView:Overlay,Polyline,ControlPosition:{RIGHT_TOP:3},event:{clearInstanceListeners(){}}}};
  const callback=new URL(document.currentScript.src).searchParams.get('callback');window[callback]();
})();
