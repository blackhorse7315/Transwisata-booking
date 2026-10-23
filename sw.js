const CACHE='transwisata-__BUILD_VERSION__';
const base=new URL('./',self.location.href);
const assets=['./','customization.js','multicity.js','runway-data.js','runways.js','app-config.js','manifest.webmanifest','assets/favicon-32.png','assets/icon-192.png','assets/icon-512.png','assets/icon-maskable-512.png','assets/apple-touch-icon.png','assets/logo.png'].map(p=>new URL(p,base).href);

function brandDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('company-branding-'+self.registration.scope,1);request.onupgradeneeded=()=>request.result.createObjectStore('settings');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function getBrand(){const db=await brandDB();try{return await new Promise((resolve,reject)=>{const request=db.transaction('settings').objectStore('settings').get('public');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{db.close()}}
async function setBrand(value){const db=await brandDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(value,'public');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
self.addEventListener('message',event=>{
 const value=event.data?.branding;
 if(event.data?.type!=='company-branding'||!value||typeof value.name!=='string'||value.name.length>1500||!/^#[0-9a-f]{6}$/i.test(value.theme_color)||!/^#[0-9a-f]{6}$/i.test(value.background_color)||!Array.isArray(value.icons)||value.icons.length!==3||value.icons.some(icon=>typeof icon.src!=='string'||!icon.src.startsWith('data:image/png;base64,')||icon.src.length>1000000))return;
 event.waitUntil(setBrand(value).then(()=>event.ports[0]?.postMessage('saved')));
});
async function companyManifest(request){
 try{
  const branding=await getBrand();
  if(branding)return new Response(JSON.stringify({...branding,id:base.href,start_url:base.href,scope:base.href,display:'standalone'}),{headers:{'Content-Type':'application/manifest+json','Cache-Control':'no-store'}});
 }catch(error){}
 try{return await fetch(request)}catch(error){return caches.match(new URL('manifest.webmanifest',base).href)}
}

self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(assets)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('transwisata-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 if(url.pathname===new URL('manifest.webmanifest',base).pathname){event.respondWith(companyManifest(event.request));return}
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(new URL('./',base).href,copy)))}return response}).catch(()=>caches.match(new URL('./',base).href)));
 }else if(assets.includes(url.href)){
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}).catch(()=>caches.match(event.request)));
 }
});
// Firebase requests remain on the network and are never cached by this worker.
