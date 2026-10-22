
/* Configuration-only company editor. No arbitrary HTML or JavaScript is accepted. */
(function(){
'use strict';
const el=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
const firebaseKeys=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId'];
const textFields={companyName:'Nama perusahaan',appName:'Nama aplikasi / instalasi',tagline:'Tagline',eyebrow:'Teks di atas judul',heroTitle:'Judul halaman',heroText:'Deskripsi halaman',fleetTitle:'Judul daftar armada',fleetIntro:'Pengantar daftar armada',fleetNote:'Catatan operasional',footer:'Footer',bookLabel:'Menu booking',trackLabel:'Menu tracking',adminLabel:'Menu Admin',installLabel:'Tombol instalasi'};
const colorFields={primary:'Warna utama',accent:'Warna tombol',background:'Latar halaman',text:'Warna teks'};
const defaultFleet=aircraft.map(a=>({name:a[0],description:a[1],registration:a[2],type:isHelicopter(a[0])?'helicopter':'fixed',planningSpeed:assumptions[a[0]].speed,rateUSD:assumptions[a[0]].rate,burnLiters:assumptions[a[0]].burn*3.785411784,cruiseSpeed:fleetSpecs()[a[0]].speed,endurance:fleetSpecs()[a[0]].endurance,seats:fleetSpecs()[a[0]].seats,range:fleetSpecs()[a[0]].range,dailyHours:planningLimits[a[0]].daily,maxLegMinutes:135,active:true}));
const defaults={version:1,companyName:'TRANSWISATA',appName:'Transwisata Private Aviation',tagline:'PRIVATE AVIATION',eyebrow:'EXCLUSIVE AIR CHARTER',heroTitle:'Your Journey. Our Commitment.',heroText:'Explore private aviation with Transwisata Prima Aviation. Request a tailored charter flight in minutes.',fleetTitle:'Compare Aircraft & Prices',fleetIntro:'Prices update automatically from your route and travel details. Tap View Price Details to see the breakdown.',fleetNote:'Aircraft assignments depend on route, passenger load, performance, maintenance status and regulatory approvals.',footer:'© 2026 PT Transwisata Prima Aviation · No payment collected',bookLabel:'Book Flight',trackLabel:'Track Booking',adminLabel:'Admin',installLabel:'Install Aplikasi',primary:'#0b1b30',accent:'#d5a95c',background:'#f3f6fa',text:'#15243a',logoData:'',iconData:'',fleet:defaultFleet};
window.TWACustomFleet=clone(defaultFleet);
let liveConfig=clone(defaults),draftFleet=[],logoDraft='',iconDraft='';
const message=text=>{el('saStatus').textContent=text};
function validImage(value){return value===''||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<=85000}
function validateConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Konfigurasi tidak valid.');
 const out={version:1};
 for(const key of Object.keys(textFields)){if(typeof input[key]!=='string'||input[key].length>1500)throw Error('Teks tidak valid: '+key);out[key]=input[key]}
 for(const key of Object.keys(colorFields)){if(!/^#[0-9a-f]{6}$/i.test(input[key]||''))throw Error('Warna tidak valid: '+key);out[key]=input[key]}
 for(const key of ['logoData','iconData']){if(!validImage(input[key]||''))throw Error('Logo/ikon tidak valid atau terlalu besar.');out[key]=input[key]||''}
 if(!Array.isArray(input.fleet)||input.fleet.length<1||input.fleet.length>40)throw Error('Isi 1–40 pesawat.');
 const names=new Set(),regs=new Set();
 out.fleet=input.fleet.map(row=>{
  const r={name:String(row.name||'').trim(),description:String(row.description||'').trim(),registration:String(row.registration||'').trim().toUpperCase(),type:row.type,active:row.active!==false};
  if(!r.name||r.name.length>80||!r.name.match(/^[\p{L}\p{N} ._()+\/-]+$/u)||r.description.length>250||!r.registration.match(/^[A-Z0-9][A-Z0-9-]{1,19}$/)||r.name==='To be advised'||['__proto__','constructor','prototype'].includes(r.name.toLowerCase())||names.has(r.name.toLowerCase())||regs.has(r.registration)||!['helicopter','fixed'].includes(r.type))throw Error('Nama/registrasi pesawat harus unik dan valid.');
  names.add(r.name.toLowerCase());regs.add(r.registration);
  for(const key of ['planningSpeed','rateUSD','burnLiters','cruiseSpeed','endurance','seats','range','dailyHours','maxLegMinutes']){
   r[key]=Number(row[key]);if(!Number.isFinite(r[key])||r[key]<0||r[key]>10000000)throw Error('Angka pesawat tidak valid: '+r.name+' / '+key);
  }
  if(r.planningSpeed<=0||r.dailyHours<=0||r.maxLegMinutes<=0||!Number.isInteger(r.seats)||r.seats<1)throw Error('Kecepatan, batas harian, batas leg, dan kursi harus lebih dari nol.');
  return r;
 });
 if(!out.fleet.some(r=>r.active))throw Error('Minimal satu pesawat harus aktif.');
 out.fleetByReg=Object.fromEntries(out.fleet.map(r=>[r.registration,{name:r.name,active:r.active}]));
 if(JSON.stringify(out).length>230000)throw Error('Konfigurasi terlalu besar. Kurangi ukuran logo atau teks.');
 return out;
}
window.validateCompanyConfig=validateConfig;

let companyInstallRevision=0;
async function refreshCompanyInstallManifest(config){
 if(!('serviceWorker' in navigator))return;
 const revision=++companyInstallRevision;
 try{
  const source=config.iconData||config.logoData||new URL('assets/icon-512.png',location.href).href;
  const asData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
  const icons=await Promise.all([[192,false],[512,false],[512,true]].map(async([size,mask])=>({src:await asData(await pngIcon(source,size,mask)),sizes:size+'x'+size,type:'image/png',purpose:mask?'maskable':'any'})));
  if(revision!==companyInstallRevision)return;
  const registration=await navigator.serviceWorker.ready;if(!registration.active||revision!==companyInstallRevision)return;
  const channel=new MessageChannel();
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Manifest update timed out')),5000);channel.port1.onmessage=()=>{clearTimeout(timeout);resolve()};registration.active.postMessage({type:'company-branding',branding:{name:config.appName,short_name:config.companyName.slice(0,20),theme_color:config.primary,background_color:config.background,icons}},[channel.port2])});
  channel.port1.close();
  if(revision===companyInstallRevision)document.querySelector('link[rel="manifest"]').href=new URL('manifest.webmanifest?company='+Date.now(),location.href).href;
 }catch(error){console.warn('Company install manifest:',error.message)}
}

let faviconRevision=0;
async function refreshCompanyFavicon(source){
 const revision=++faviconRevision,link=document.querySelector('link[rel="icon"]');
 // Keep a versioned, correctly sized PNG fallback while a custom image is decoded.
 link.type='image/png';link.setAttribute('sizes','32x32');
 link.href=new URL('assets/favicon-32.png?v=20261022-3',location.href).href;
 if(!source)return;
 try{
  const blob=await pngIcon(source,32),data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
  if(revision===faviconRevision)link.href=data;
 }catch(error){console.warn('Company favicon:',error.message)}
}

function setText(id,text){const node=el(id);if(node)node.textContent=text}
function applyFleet(config,preview=false){
 const next=config.fleet.filter(r=>r.active),signature=JSON.stringify([config.fleet,preview]);
 if(window.TWAFleetSignature===signature)return;
 window.TWAFleetSignature=signature;window.TWAFleetPreview=preview;window.TWACustomFleet=clone(config.fleet);
 const costs=readCostConfig(),savedSpecs=fleetSpecs(),currentPlane=el('plane').value;
 aircraft.splice(0,aircraft.length,...next.map(r=>[r.name,r.description,r.registration]));
 for(const key of Object.keys(assumptions))delete assumptions[key];
 for(const key of Object.keys(fleetSpecDefaults))delete fleetSpecDefaults[key];
 for(const key of Object.keys(planningLimits))delete planningLimits[key];
 for(const r of next){
  assumptions[r.name]={speed:r.planningSpeed,rate:preview?r.rateUSD:costs.aircraft?.[r.name]?.rate??r.rateUSD,burn:preview?r.burnLiters/3.785411784:costs.aircraft?.[r.name]?.burn??r.burnLiters/3.785411784};
  fleetSpecDefaults[r.name]={speed:r.cruiseSpeed,endurance:r.endurance,seats:r.seats,range:r.range};
  planningLimits[r.name]={endurance:r.endurance,daily:r.dailyHours};
 }
 el('plane').replaceChildren(new Option('Let us recommend',''),...next.map(r=>new Option(r.name,r.name)));
 el('plane').value=assumptions[currentPlane]?currentPlane:'';
 el('fleet').innerHTML=next.map(r=>'<article class="aircraft"><div class="art">✈</div><div class="details"><span class="pill">'+esc(r.registration)+'</span><h3>'+esc(r.name)+'</h3><p>'+esc(r.description)+'</p></div></article>').join('');
 const routeSelector=el('heliRouteAircraft');if(routeSelector){routeSelector.replaceChildren(...next.filter(r=>r.type==='helicopter').map(r=>new Option(r.name,r.name)),new Option('Semua helikopter','both'))}
 applyFleetPhotos();renderFleetPrices();updateHoldUI();
 if(window.TWAAdminVerified){drawAdminCosts();drawFleetSpecsAdmin();drawFleetPhotoAdmin()}
}
window.applyCompanyCustomization=function(input,options={}){
 let config;try{config=validateConfig({...defaults,...input})}catch(error){console.error('Company configuration:',error.message);return}
 liveConfig=config;
 const ids={companyName:'appCompanyName',tagline:'appTagline',eyebrow:'appEyebrow',heroTitle:'appHeroTitle',heroText:'appHeroText',fleetTitle:'appFleetTitle',fleetIntro:'appFleetIntro',fleetNote:'appFleetNote',footer:'appFooter',bookLabel:'appBookNav',trackLabel:'appTrackNav',adminLabel:'appAdminNav',installLabel:'appInstallButton'};
 for(const [key,id] of Object.entries(ids))setText(id,config[key]);
 document.title=config.appName;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',config.primary);
 let style=el('companyTheme');if(!style){style=document.createElement('style');style.id='companyTheme';document.head.append(style)}
 style.textContent='body{background:'+config.background+'!important;color:'+config.text+'}header,footer{background:'+config.primary+'!important}.hero{background:linear-gradient(110deg,'+config.primary+','+config.primary+'d9)!important}.btn:not(.secondary){background:'+config.accent+'!important}.tabs button.active{background:'+config.primary+'!important}.hero>div>span{color:'+config.accent+'!important}#fleet .fleet-detail{background:'+config.primary+'!important}#fleet .fleet-price{color:'+config.primary+'!important}.summary-strip.premium-route{background:'+config.primary+'!important}';
 el('appBrandLogo').src=config.logoData||new URL('assets/logo.png',location.href).href;
 const icon=config.iconData||config.logoData;
 refreshCompanyFavicon(icon);
 document.querySelector('link[rel="apple-touch-icon"]').href=icon||new URL('assets/apple-touch-icon.png',location.href).href;
 applyFleet(config,!!options.preview);
 if(!options.preview)refreshCompanyInstallManifest(config);
 const status=el('saConnection');if(status)status.textContent='Project aktif: '+(window.TWA_BOOTSTRAP?.firebase?.projectId||'default');
};
function formMarkup(){
 return '<div id="saGate"><h2>Super Admin</h2><p class="small">Akses khusus pemilik aplikasi. Login ini diverifikasi melalui Firestore Rules.</p><div class="grid"><div><label>Email</label><input id="saEmail" type="email" autocomplete="username"></div><div><label>Password</label><input id="saPassword" type="password" autocomplete="current-password"></div></div><div class="actions"><button class="btn" onclick="superAdminLogin()">Masuk Super Admin</button></div></div><div id="saWorkspace" class="hidden"><h2>Company App Builder</h2><p id="saConnection" class="small"></p><p class="small">Simpan konfigurasi untuk mengubah aplikasi aktif di semua perangkat. Ekspor paket perusahaan untuk membuat aplikasi lain dengan Firebase dan akun yang terpisah; data pelanggan tidak ikut diekspor.</p><h3>Identitas & Teks</h3><div class="costgrid">'+Object.entries(textFields).map(([key,label])=>'<label>'+label+'<input id="sa_'+key+'" maxlength="1500"></label>').join('')+'</div><h3>Warna</h3><div class="costgrid">'+Object.entries(colorFields).map(([key,label])=>'<label>'+label+'<input id="sa_'+key+'" type="color"></label>').join('')+'</div><h3>Logo & Ikon Instalasi</h3><div class="costgrid"><label>Logo perusahaan<input type="file" accept="image/png,image/jpeg,image/webp" onchange="loadSuperAdminImage(this,\'logo\')"></label><label>Ikon aplikasi<input type="file" accept="image/png,image/jpeg,image/webp" onchange="loadSuperAdminImage(this,\'icon\')"></label></div><div id="saImagePreview"></div><h3>Armada</h3><p class="small">Harga charter dalam USD/jam, fuel burn dalam liter/jam. Menghapus atau mengganti nama pesawat dengan hold aktif harus dilakukan setelah hold dilepas. Riwayat booking lama tetap tersimpan.</p><div id="saFleetRows"></div><button class="btn secondary" onclick="addSuperAdminAircraft()">Tambah Pesawat</button><div class="actions"><button class="btn" onclick="saveSuperAdminConfig()">Simpan Konfigurasi Aplikasi Aktif</button><button class="btn secondary" onclick="previewSuperAdminConfig()">Pratinjau</button><button class="btn secondary" onclick="cancelSuperAdminPreview()">Batalkan Pratinjau</button></div><h3>Paket Perusahaan & Firebase</h3><p class="small">Pengaturan berikut berlaku untuk paket perusahaan yang diekspor. Tidak memindahkan akun, data, atau mengganti koneksi aplikasi aktif. Gunakan Firebase Web Config publik; jangan masukkan password atau service-account key.</p><div class="costgrid">'+firebaseKeys.map(key=>'<label>'+key+'<input id="sa_fb_'+key+'"></label>').join('')+'<label>Super Admin UID pada Firebase tujuan<input id="saSuperUid"></label><label>Admin UID tujuan (pisahkan dengan koma)<input id="saAdminUids"></label></div><div class="actions"><button class="btn secondary" onclick="testCompanyFirebase()">Periksa Akses Publik Firebase Tujuan</button><button class="btn" onclick="exportCompanyApp()">Unduh Paket Aplikasi (.zip)</button><button class="btn secondary" onclick="exportSuperAdminConfig()">Ekspor Konfigurasi (.json)</button><label class="btn secondary">Impor Konfigurasi<input type="file" accept=".json,application/json" onchange="importSuperAdminConfig(this)" style="display:none"></label></div><p class="small">Sebelum dipakai, buat akun pada Firebase tujuan, aktifkan Email/Password dan Anonymous, lalu terapkan firestore.rules dari paket. Unggah isi ZIP ke hosting HTTPS; tidak perlu build. Ikon PWA yang sudah terpasang mungkin memerlukan pemasangan ulang.</p></div><p id="saStatus" role="status" aria-live="polite"></p><p class="small">Untuk akses Super Admin, terapkan <a href="./firestore.rules" target="_blank" rel="noopener">Firestore Rules versi Super Admin</a> terlebih dahulu di Firebase Console.</p>';
}
const section=document.createElement('section');section.id='superAdmin';section.className='panel hidden';section.style.marginTop='20px';section.innerHTML=formMarkup();document.querySelector('main').append(section);
const superNav=document.createElement('button');superNav.type='button';superNav.textContent='Super Admin';superNav.onclick=()=>showPage('superAdmin');document.querySelector('header nav').append(superNav);
window.syncSuperAdminView=function(){
 const ok=!!window.TWASuperAdminVerified;el('saGate').classList.toggle('hidden',ok);el('saWorkspace').classList.toggle('hidden',!ok);
 if(ok)fillForm(liveConfig,true);
};
window.superAdminLogin=async function(){
 try{
  if(!window.TWAFirebase)throw Error('Firebase belum siap.');
  const email=el('saEmail').value.trim(),password=el('saPassword').value;el('saPassword').value='';
  await window.TWAFirebase.adminLogin(email,password);await window.TWAFirebase.verifySuperAdmin();syncSuperAdminView();message('Super Admin terverifikasi.');
 }catch(e){message('Akses Super Admin gagal: '+(e.code||e.message)+'. Pastikan UID dan Firestore Rules sudah sesuai.')}
};
function fillForm(config,hydrate=false){
 for(const key of [...Object.keys(textFields),...Object.keys(colorFields)])el('sa_'+key).value=config[key];
 draftFleet=clone(config.fleet);if(hydrate){const specs=fleetSpecs();for(const row of draftFleet){const rates=assumptions[row.name],spec=specs[row.name];if(rates){row.rateUSD=rates.rate;row.burnLiters=rates.burn*3.785411784}if(spec){row.cruiseSpeed=spec.speed;row.endurance=spec.endurance;row.seats=spec.seats;row.range=spec.range}}}logoDraft=config.logoData||'';iconDraft=config.iconData||'';drawFleetRows();drawImages();
 const bootstrap=window.TWA_BOOTSTRAP||{};
 for(const key of firebaseKeys)el('sa_fb_'+key).value=bootstrap.firebase?.[key]||'';
 el('saSuperUid').value=bootstrap.superAdminUid||'';el('saAdminUids').value=(bootstrap.adminUids||[]).join(',');
}
const fleetLabels={name:'Nama / model',registration:'Registrasi',description:'Deskripsi',planningSpeed:'Planning speed (kts)',rateUSD:'Charter USD/jam',burnLiters:'Fuel liter/jam',cruiseSpeed:'Cruise speed (kts)',endurance:'Endurance (HH:MM)',seats:'Kursi',range:'Max range (NM)',dailyHours:'Batas jam/hari',maxLegMinutes:'Batas leg otomatis (menit)'};
function captureFleetRows(){
 const rows=[];
 document.querySelectorAll('#saFleetRows .sa-fleet-row').forEach(node=>{
  const row={};
  for(const key of Object.keys(fleetLabels)){const value=node.querySelector('[data-field="'+key+'"]').value;row[key]=key==='endurance'?enduranceFromHHMM(value):['name','registration','description'].includes(key)?value:Number(value)}
  row.type=node.querySelector('[data-field="type"]').value;row.active=node.querySelector('[data-field="active"]').checked;rows.push(row);
 });return rows;
}
function drawFleetRows(){
 el('saFleetRows').innerHTML=draftFleet.map((r,i)=>'<div class="fleet-spec-admin-item sa-fleet-row"><h4>'+esc(r.name||'Pesawat baru')+'</h4><div class="costgrid">'+Object.entries(fleetLabels).map(([key,label])=>'<label>'+label+'<input data-field="'+key+'" '+(['name','registration','description','endurance'].includes(key)?'type="text"':'type="number" min="0" step="any"')+' value="'+esc(key==='endurance'?enduranceToHHMM(r[key]):r[key])+'"></label>').join('')+'<label>Jenis<select data-field="type"><option value="fixed" '+(r.type==='fixed'?'selected':'')+'>Fixed wing</option><option value="helicopter" '+(r.type==='helicopter'?'selected':'')+'>Helikopter</option></select></label><label>Aktif<input data-field="active" type="checkbox" '+(r.active?'checked':'')+' style="width:auto"></label></div><button type="button" class="btn secondary" data-remove="'+i+'">Hapus dari daftar</button></div>').join('');
 el('saFleetRows').querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{draftFleet=captureFleetRows();draftFleet.splice(Number(button.dataset.remove),1);drawFleetRows()});
}
window.addSuperAdminAircraft=function(){draftFleet=captureFleetRows();draftFleet.push({name:'',registration:'',description:'',type:'fixed',planningSpeed:200,rateUSD:0,burnLiters:0,cruiseSpeed:200,endurance:3,seats:6,range:600,dailyHours:8,maxLegMinutes:135,active:true});drawFleetRows()};
function drawImages(){el('saImagePreview').innerHTML=[logoDraft,iconDraft].filter(Boolean).map(src=>'<img alt="Preview" src="'+src+'" style="height:80px;width:80px;object-fit:contain;margin:8px;background:white;border:1px solid #ddd">').join('')}
window.loadSuperAdminImage=async function(input,kind){
 const file=input.files?.[0];if(!file)return;
 try{
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Pilih JPG, PNG, atau WebP.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
  const img=await imageFrom(data);let width=512,value='';
  for(let attempt=0;attempt<6;attempt++){const canvas=document.createElement('canvas');const scale=Math.min(1,width/img.width,width/img.height);canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);value=canvas.toDataURL('image/png');if(value.length<=85000)break;width=Math.round(width*.75)}
  if(value.length>85000)throw Error('Ukuran logo masih terlalu besar.');
  if(kind==='logo')logoDraft=value;else iconDraft=value;drawImages();message('Gambar siap. Klik Simpan atau Ekspor Paket untuk menerapkan.');
 }catch(e){message(e.message)}
};
function imageFrom(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Gambar tidak dapat dibaca.'));img.src=src})}
function collectConfig(){
 const input={fleet:captureFleetRows(),logoData:logoDraft,iconData:iconDraft};
 for(const key of [...Object.keys(textFields),...Object.keys(colorFields)])input[key]=el('sa_'+key).value;
 return validateConfig(input);
}
function ensureSuper(){if(!window.TWASuperAdminVerified)throw Error('Login Super Admin diperlukan.')}
function checkActiveFleetChanges(next){
 for(const [name,hold] of Object.entries(cleanHolds())){const old=aircraft.find(a=>a[0]===name);if(!old)continue;const match=next.fleet.find(r=>r.registration===old[2]&&r.name===name&&r.active);if(!match)throw Error('Lepaskan hold '+name+' sebelum menghapus, menonaktifkan, atau mengganti nama/registrasinya.')}
}
window.previewSuperAdminConfig=function(){try{ensureSuper();const current=liveConfig,next=collectConfig();checkActiveFleetChanges(next);applyCompanyCustomization(next,{preview:true});liveConfig=current;message('Pratinjau pada perangkat ini. Klik Simpan untuk semua perangkat.')}catch(e){message(e.message)}};
window.cancelSuperAdminPreview=function(){applyCompanyCustomization(liveConfig);syncSuperAdminView();message('Pratinjau dibatalkan.')};
window.saveSuperAdminConfig=async function(){
 try{ensureSuper();const next=collectConfig();checkActiveFleetChanges(next);message('Menyimpan konfigurasi…');await window.TWAFirebase.saveCustomization(next);applyCompanyCustomization(next);message('Konfigurasi tersimpan dan diperbarui pada perangkat lain. Ikon instalasi mengikuti paket publikasi.')}catch(e){message('Gagal menyimpan: '+(e.code||e.message))}
};
function companyBootstrap(config){
 const firebase={};for(const key of firebaseKeys)firebase[key]=el('sa_fb_'+key).value.trim();
 if(!/^[a-z0-9][a-z0-9-]{3,62}$/.test(firebase.projectId)||!firebase.apiKey||!firebase.appId||!firebase.authDomain)throw Error('Lengkapi Firebase Web Config tujuan.');
 if(!/^[a-z0-9.-]+$/i.test(firebase.authDomain)||!firebase.authDomain.endsWith('.firebaseapp.com'))throw Error('Gunakan authDomain Firebase resmi.');
 const superAdminUid=el('saSuperUid').value.trim(),adminUids=[...new Set(el('saAdminUids').value.split(',').map(s=>s.trim()).filter(Boolean))];
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(superAdminUid)||adminUids.some(v=>!/^[A-Za-z0-9_-]{1,128}$/.test(v)))throw Error('Isi UID Super Admin dan UID Admin yang valid.');
 return {firebase,superAdminUid,adminUids,initialCustomization:config};
}
window.testCompanyFirebase=async function(){
 try{ensureSuper();const bootstrap=companyBootstrap(collectConfig());message('Memeriksa akses publik…');await window.TWAFirebase.testCompanyFirebase(bootstrap.firebase);message('Dokumen pengaturan dapat dibaca. Akun, rules tulis, dan Anonymous Authentication masih harus diperiksa pada proyek tujuan.')}catch(e){message('Pemeriksaan gagal: '+(e.code||e.message))}
};
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
window.exportSuperAdminConfig=function(){try{ensureSuper();download('company-config.json',JSON.stringify(companyBootstrap(collectConfig()),null,2),'application/json')}catch(e){message(e.message)}};
window.importSuperAdminConfig=async function(input){
 try{ensureSuper();const file=input.files?.[0];if(!file)return;if(file.size>500000)throw Error('File konfigurasi maksimal 500 KB.');const raw=JSON.parse(await file.text()),config=validateConfig(raw.initialCustomization||raw);fillForm(config);
 if(raw.firebase){for(const key of firebaseKeys)el('sa_fb_'+key).value=raw.firebase[key]||'';el('saSuperUid').value=raw.superAdminUid||'';el('saAdminUids').value=(raw.adminUids||[]).join(',')}
 message('Konfigurasi diimpor ke form. Belum mengubah aplikasi aktif.');
 }catch(e){message('Impor gagal: '+e.message)}
};
async function readAsset(path,type='text'){const response=await fetch(new URL(path,location.href),{cache:'no-store'});if(!response.ok)throw Error('File paket gagal dibaca: '+path);return type==='blob'?response.blob():response.text()}
async function pngIcon(source,size,maskable=false){
 const image=await imageFrom(source),canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);const area=size*(maskable ? 0.6 : 0.84),scale=Math.min(area/image.width,area/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(size-w)/2,(size-h)/2,w,h);return await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}
window.exportCompanyApp=async function(){
 try{
  ensureSuper();const config=collectConfig(),bootstrap=companyBootstrap(config);message('Membuat paket perusahaan…');
  if(!window.JSZip){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';script.onload=resolve;script.onerror=()=>reject(Error('Library ZIP gagal dimuat.'));document.head.append(script)})}
  const zip=new window.JSZip(),[html,customJs,sw,rules,originalLogo]=await Promise.all([readAsset('index.html'),readAsset('customization.js'),readAsset('sw.js'),readAsset('firestore.rules'),readAsset('assets/logo.png','blob')]);
  zip.file('index.html',html);zip.file('customization.js',customJs);zip.file('app-config.js','window.TWA_BOOTSTRAP = '+JSON.stringify(bootstrap)+';');
  zip.file('sw.js',sw.replace(/__BUILD_VERSION__/g,Date.now().toString()).replace(/transwisata-[a-f0-9]{40}/g,'transwisata-'+Date.now()));
  const source=config.iconData||config.logoData||URL.createObjectURL(originalLogo);
  try{
   zip.file('assets/logo.png',await pngIcon(config.logoData||source,512));
   for(const [name,size,mask] of [['favicon-32.png',32,false],['icon-192.png',192,false],['icon-512.png',512,false],['icon-maskable-512.png',512,true],['apple-touch-icon.png',180,false]])zip.file('assets/'+name,await pngIcon(source,size,mask));
  }finally{if(source.startsWith('blob:'))URL.revokeObjectURL(source)}
  const manifest={id:'./',name:config.appName,short_name:config.companyName.slice(0,20),start_url:'./',scope:'./',display:'standalone',background_color:config.background,theme_color:config.primary,icons:[{src:'assets/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'assets/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
  zip.file('manifest.webmanifest',JSON.stringify(manifest,null,2));
  zip.file('firestore.rules',rules.replace(/function isSuperAdmin\(\)\s*\{\s*return signedIn\(\) && request.auth.uid == ['"][A-Za-z0-9_-]+['"];\s*\}/,'function isSuperAdmin() { return signedIn() && request.auth.uid == '+JSON.stringify(bootstrap.superAdminUid)+'; }').replace(/request.auth.uid in \[[^\]]*\]; \/\/ COMPANY_ADMIN_UIDS/,'request.auth.uid in '+JSON.stringify([...new Set([bootstrap.superAdminUid,...bootstrap.adminUids])])+'; // COMPANY_ADMIN_UIDS'));
  zip.file('README.txt','COMPANY APP PACKAGE\n1. Create Firebase Authentication accounts; enable Email/Password and Anonymous.\n2. Confirm UIDs in app-config.js and firestore.rules.\n3. Publish firestore.rules in the TARGET Firebase project.\n4. Upload all package files to an HTTPS static host. No build required.\n5. Sign in as Super Admin and Save Configuration to publish defaults to Firestore.\nThis package contains no customer records and does not migrate accounts or payments.\n');
  const blob=await zip.generateAsync({type:'blob'});download('company-app-'+bootstrap.firebase.projectId+'.zip',blob,'application/zip');message('Paket siap diunggah ke hosting HTTPS. Terapkan rules pada Firebase tujuan sebelum login.');
 }catch(e){message('Ekspor gagal: '+e.message)}
};
window.getCurrentCompanyConfig=()=>clone(liveConfig);
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>refreshCompanyInstallManifest(liveConfig));
applyCompanyCustomization(window.TWA_BOOTSTRAP?.initialCustomization||defaults);
syncSuperAdminView();
})();
