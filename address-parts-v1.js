/* AuxiliOS · separa una dirección de Google en calle, localidad y provincia.
   Lo usan la tabla de Servicios y el Excel de Facturación, para que las dos muestren lo mismo.
   Formatos que llegan de Google en Argentina:
     «Calle 123, B1834ABC Localidad, Provincia de Buenos Aires[, Argentina]»
     «Calle 123, C1408 Cdad. Autónoma de Buenos Aires»   (CABA: el código postal va pegado y no hay localidad)
     «ACR, Vélez Sársfield 2501, B1824 Lanús, …»          (las letras del código postal salen adelante)
     «B1834 Temperley, Provincia de Buenos Aires»         (se eligió una localidad, sin calle)
   No inventa datos: si la dirección no trae calle o localidad, esa parte queda vacía. */
(function(root){'use strict';
const text=v=>v==null?'':String(v).trim();
const PROVINCES=/^(provincia\s+de\s+)?(buenos aires|gran buenos aires|catamarca|chaco|chubut|córdoba|cordoba|corrientes|entre ríos|entre rios|formosa|jujuy|la pampa|la rioja|mendoza|misiones|neuquén|neuquen|río negro|rio negro|salta|san juan|san luis|santa cruz|santa fe|santiago del estero|tierra del fuego.*|tucumán|tucuman)$/i;
const CABA=/^(caba|c\.a\.b\.a\.?|capital federal|(ciudad|cdad\.?)\s+aut[oó]noma(\s+de\s+b[a-z]*(\s+a[a-z]*)?)?|autonome stad buenos aires)$/i;
const POSTAL=/^[A-Z]?\d{4}[A-Z]{0,3}$/i;
const POSTAL_ONLY=/^[A-Z]?\d{4}(\s?[A-Z]{3})?(\s+[A-Z]?\d{4}(\s?[A-Z]{3})?)*$/i;
const COORDS=/^-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+$/;
/* Con una sola parte antes de la provincia: si parece calle (número, esquina, ruta…) es la calle; si no, la localidad. */
const STREETISH=/\d|&|\b(av|avda|avenida|calle|c|ruta|rp|rn|autopista|autovía|autovia|au|acceso|camino|cno|pje|pasaje|blvd|bv|bulevar|diag|diagonal|colectora|km|y)\b\.?/i;
const isPostalWord=w=>POSTAL.test(w)&&/\d{4}/.test(w);
/* El código postal va al principio de la parte («B1834 Temperley»); un 1234 al final es la altura de la calle. */
function postalOf(v){const w=text(v).split(/\s+/)[0]||'';return isPostalWord(w)?w:'';}
function stripPostal(v){const w=text(v).split(/\s+/);while(w.length&&isPostalWord(w[0]))w.shift();return w.join(' ').trim();}
function normalizeProvince(v){const s=stripPostal(v);if(CABA.test(s))return'CABA';if(/^gran buenos aires$/i.test(s))return'Buenos Aires';return s.replace(/^Provincia\s+de\s+/i,'').replace(/^Provincia\s+/i,'').trim();}
function isProvince(v){const s=stripPostal(v);return CABA.test(s)||PROVINCES.test(s);}
function parse(value){
  const raw=text(value).replace(/\s*\t+\s*/g,', ');
  if(!raw)return{street:'',locality:'',province:''};
  if(COORDS.test(raw))return{street:raw,locality:'',province:''};
  const p=raw.split(',').map(x=>x.trim()).filter(Boolean);let province='',locality='',street='',postalApart=false;
  while(p.length>1&&/^(argentina|ar)$/i.test(p[p.length-1]))p.pop();
  if(p.length>1&&/^[A-Z]{3}$/.test(p[0])&&p.slice(1).some(x=>x.split(/\s+/).some(w=>/^[A-Z]\d{4}$/i.test(w)||w.toUpperCase().endsWith(p[0])&&isPostalWord(w))))p.shift();
  if(p.length>1&&isProvince(p[p.length-1])){const part=p.pop();postalApart=Boolean(postalOf(part));province=normalizeProvince(part);}
  while(p.length>1&&POSTAL_ONLY.test(p[p.length-1])){p.pop();postalApart=true;}
  if(postalApart){
    /* El código postal no vino junto a una localidad: en CABA la localidad es la ciudad; en el resto no se sabe. */
    street=p.join(', ');locality=province==='CABA'?'CABA':'';
  }else if(p.length>=2){
    const part=p.pop();locality=stripPostal(part);street=p.join(', ');
    /* Google a veces pone «Cdad. Autónoma» a localidades del conurbano; el código postal B dice que es Provincia. */
    if(province==='CABA'&&/^B/i.test(postalOf(part)))province='Buenos Aires';
  }else if(p.length===1){
    const only=p[0];
    if(province&&(postalOf(only)||!STREETISH.test(only)))locality=stripPostal(only);
    else{street=only;if(province==='CABA')locality='CABA';}
  }
  if(!street&&!locality&&!province)street=raw;
  return{street,locality,province};
}
const api={parse,stripPostal};
root.AuxiliosAddress=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
