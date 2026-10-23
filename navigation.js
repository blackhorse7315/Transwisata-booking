/* Shared admin airport/VFR directory. Coordinates are entered as DMS and stored as decimal degrees. */
(function(){
'use strict';
const el=id=>document.getElementById(id),copy=v=>JSON.parse(JSON.stringify(v));
const originalAirports=airportData.map(a=>a.slice()),originalRunways=copy(window.TWARunwayReference?.airports||{});
let directory={airports:{},vfrPoints:{}},signature='',airportEdit='',vfrEdit='';
window.isVFRPoint=point=>point?.[5]?.kind==='vfr';
window.navDmsToDecimal=function(value,axis){
 const text=String(value||'').trim().toUpperCase().replace(/,/g,'.');
 const hemis=text.match(/[NSEW]/g)||[],allowed=axis==='lat'?'NS':'EW',max=axis==='lat'?90:180;
 if(hemis.length!==1||!allowed.includes(hemis[0])||/[^0-9.NSEW°'"\u2032\u2033\u2019\u201d\s]/.test(text))throw Error('Use DMS with '+(axis==='lat'?'N or S':'E or W')+', for example '+(axis==='lat'?'06° 16′ 00″ S':'106° 53′ 00″ E')+'.');
 const parts=text.replace(/[NSEW°'"\u2032\u2033\u2019\u201d]/g,' ').trim().split(/\s+/).map(Number);
 const [degrees,minutes,seconds]=parts;
 if(parts.length!==3||parts.some(n=>!Number.isFinite(n))||!Number.isInteger(degrees)||!Number.isInteger(minutes)||degrees<0||degrees>max||minutes<0||minutes>=60||seconds<0||seconds>=60||degrees===max&&(minutes!==0||seconds!==0))throw Error('Invalid DMS: degrees 0–'+max+', minutes 0–59, seconds below 60.');
 const sign='SW'.includes(hemis[0])?-1:1;return sign*(degrees+minutes/60+seconds/3600);
};
window.navDecimalToDms=function(value,axis){
 const max=axis==='lat'?90:180;if(!Number.isFinite(Number(value))||Math.abs(Number(value))>max)throw Error('Invalid coordinate.');
 let total=Math.round(Math.abs(Number(value))*3600*1000),degrees=Math.floor(total/3600000);total-=degrees*3600000;
 const minutes=Math.floor(total/60000),seconds=(total-minutes*60000)/1000,hemi=axis==='lat'?(value<0?'S':'N'):(value<0?'W':'E');
 return String(degrees).padStart(axis==='lat'?2:3,'0')+'° '+String(minutes).padStart(2,'0')+'′ '+seconds.toFixed(3).padStart(6,'0')+'″ '+hemi;
};
function validateRecord(kind,value){
 if(!value||typeof value!=='object')throw Error('Invalid directory record.');
 const lat=Number(value.lat),lon=Number(value.lon);
 if(typeof value.lat!=='number'||typeof value.lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Coordinates outside valid latitude/longitude bounds.');
 if(kind==='airports'){
  const r={name:String(value.name||'').trim(),city:String(value.city||'').trim(),iata:String(value.iata||'').trim().toUpperCase(),icao:String(value.icao||'').trim().toUpperCase(),runwayM:Number(value.runwayM),lat,lon};
  if(!r.name||r.name.length>150||!r.city||r.city.length>100||!/^[A-Z]{3}$/.test(r.iata)||!/^[A-Z]{4}$/.test(r.icao)||!Number.isInteger(r.runwayM)||r.runwayM<1||r.runwayM>20000)throw Error('Enter airport name, city, 3-letter IATA, 4-letter ICAO, and runway length in whole meters (1–20,000).');
  return r;
 }
 const r={name:String(value.name||'').trim().toUpperCase().replace(/\s+/g,' '),lat,lon};
 if(r.name.length<2||r.name.length>80||!/^[A-Z][A-Z0-9]*(?: [A-Z0-9]+)*$/.test(r.name))throw Error('VFR name must contain 2–80 letters/numbers and spaces, for example PIMOL or ABEAM PLM.');
 return r;
}
window.getNavigationDirectory=()=>copy(directory);
window.routePointMatch=function(value){
 const airport=airportMatch(String(value||''));if(airport)return airport;
 const r=directory.vfrPoints[String(value||'').trim().toUpperCase().replace(/\s+/g,' ')];
 return r?[r.name,'',r.name, r.lat,r.lon,{kind:'vfr'}]:null;
};
function validateCollisions(kind,r){
 const code=kind==='airports'?r.iata:r.name;
 if(kind==='airports'){
  const conflict=airportData.find(a=>(a[0]===r.iata||a[1]===r.icao)&&!(a[0]===r.iata&&a[1]===r.icao));
  if(conflict||directory.vfrPoints[r.iata]||directory.vfrPoints[r.icao])throw Error('IATA/ICAO code is already assigned to another airport or VFR point.');
 }else if(airportMatch(code))throw Error('VFR name conflicts with an airport IATA/ICAO code.');
}
window.applyNavigationDirectory=function(input={}){
 const next={airports:{},vfrPoints:{}};
 for(const [code,value] of Object.entries(input.airports||{}).slice(0,500)){
  if(!value)continue;
  try{const r=validateRecord('airports',value);if(code!==r.iata)continue;
   const all=[...originalAirports,...Object.values(next.airports).map(a=>[a.iata,a.icao])];
   if(all.some(a=>(a[0]===r.iata||a[1]===r.icao)&&!(a[0]===r.iata&&a[1]===r.icao)))continue;
   next.airports[code]=r;
  }catch(error){console.warn('Airport directory entry ignored:',code,error.message)}
 }
 const merged=originalAirports.filter(a=>!next.airports[a[0]]).concat(Object.values(next.airports).map(r=>[r.iata,r.icao,r.name+' · '+r.city,r.lat,r.lon,{kind:'airport',manual:true}]));
 for(const [code,value] of Object.entries(input.vfrPoints||{}).slice(0,500)){
  if(!value)continue;
  try{const r=validateRecord('vfrPoints',value);if(code!==r.name||merged.some(a=>a[0]===code||a[1]===code))continue;next.vfrPoints[code]=r}catch(error){console.warn('VFR directory entry ignored:',code,error.message)}
 }
 const stamp=JSON.stringify(next);if(stamp===signature)return;
 signature=stamp;directory=next;window.TWANavigationDirectory=copy(next);
 airportData.splice(0,airportData.length,...merged);
 if(window.TWARunwayReference){
  window.TWARunwayReference.airports={...copy(originalRunways),...Object.fromEntries(Object.values(next.airports).map(r=>[r.iata,{icao:r.icao,status:'available',source:'Admin-entered airport data',runways:[{id:'Admin-entered runway',lengthM:r.runwayM,surface:'Not specified'}]}]))};
 }
 try{tenantStorage.setItem('twaNavigationDirectoryV1',stamp)}catch(error){console.warn('Directory cache:',error.message)}
 window.drawNavigationAdmin?.();window.drawHelicopterRoutesAdmin?.();window.closePriceDetails?.();window.calculateEstimate?.();
};
window.routeAirportSectors=function(points,name){
 if(!Array.isArray(points)||points.length<2||isVFRPoint(points[0])||isVFRPoint(points.at(-1)))throw Error('Routes must begin and end at airports.');
 let start=0,nm=0;const legs=[];
 for(let i=1;i<points.length;i++){
  nm+=distanceBetween(points[i-1],points[i]);
  if(!isVFRPoint(points[i])){
   const route=points.slice(start,i+1);
   legs.push({from:points[start],to:points[i],points:route,via:route.slice(1,-1).map(p=>p[0]),nm,hours:nm/assumptions[name].speed});
   start=i;nm=0;
  }
 }
 return legs;
};
window.planNavigationRoute=function(points,name){
 const speed=assumptions[name].speed,lim=planningLimits[name],maxNM=speed*helicopterMaxLegHours(name);
 const invalid=reason=>({ok:false,points:points.filter(Boolean),reason,maxNM,lim});
 if(!points.every(Boolean)||points.length<2||new Set(points.map(p=>p[0])).size!==points.length||isVFRPoint(points[0])||isVFRPoint(points.at(-1)))return invalid('Saved route has an unknown/repeated airport or VFR point, or an invalid endpoint. Update the Admin directory and route.');
 let legs;try{legs=routeAirportSectors(points,name)}catch(error){return invalid(error.message)}
 if(!legs.length||legs.some(l=>!Number.isFinite(l.hours)||l.nm<=0))return invalid('Saved route has an invalid airport-to-airport flight distance.');
 if(legs.some(l=>l.hours>lim.daily+1e-8))return invalid(name+' exceeds its '+lim.daily+' hour daily limit between landing airports. VFR points are not refuel or overnight stops; add a suitable airport.');
 let day=1,dailyHours=0;const overnights=[];
 for(const leg of legs){if(dailyHours>0&&dailyHours+leg.hours>lim.daily+1e-8){overnights.push({airport:leg.from,day});day++;dailyHours=0;leg.overnightBefore=true}leg.day=day;dailyHours+=leg.hours}
 return {ok:true,source:'admin',points,airports:points.filter(p=>!isVFRPoint(p)),legs,overnights,days:day,lim,maxNM,maxLegHours:null,totalNM:legs.reduce((s,l)=>s+l.nm,0),totalHours:legs.reduce((s,l)=>s+l.hours,0)};
};
const panel=document.createElement('section');panel.id='navigationDataAdmin';
const coords=prefix=>'<label>Latitude · DMS<input id="'+prefix+'Lat" placeholder="06° 16′ 00″ S" autocomplete="off"></label><label>Longitude · DMS<input id="'+prefix+'Lon" placeholder="106° 53′ 00″ E" autocomplete="off"></label>';
panel.innerHTML='<h3>Airport Data Management</h3><p class="small">Add airports to the shared search directory. IATA uses 3 letters; ICAO uses 4 letters. Enter coordinates in degrees, minutes and seconds with N/S and E/W. Enter the longest usable runway length in meters from your verified airport reference.</p><div class="costgrid"><label>Airport name<input id="navAirportName" maxlength="150"></label><label>City<input id="navAirportCity" maxlength="100"></label><label>3-letter code · IATA<input id="navAirportIata" maxlength="3"></label><label>4-letter code · ICAO<input id="navAirportIcao" maxlength="4"></label><label>Runway length (meters)<input id="navAirportRunway" type="number" min="1" max="20000" step="1"></label>'+coords('navAirport')+'</div><div class="actions"><button class="btn" id="navAirportSave" type="button">Save Airport</button><button class="btn secondary" id="navAirportReset" type="button">Clear Form</button></div><p id="navAirportStatus" class="small" role="status" aria-live="polite"></p><div id="navAirportTable" style="overflow:auto"></div><h3>VFR Point Management</h3><p class="small">Register route identifiers such as PIMOL, GOLPI or ERANG with their verified DMS coordinates before using them in helicopter routes. VFR points affect route distance and flight time; they are not landing, refuel or ground-handling stops.</p><div class="costgrid"><label>Name VFR · identifier<input id="navVfrName" maxlength="80" placeholder="e.g. PIMOL"></label>'+coords('navVfr')+'</div><div class="actions"><button class="btn" id="navVfrSave" type="button">Save VFR Point</button><button class="btn secondary" id="navVfrReset" type="button">Clear Form</button></div><p id="navVfrStatus" class="small" role="status" aria-live="polite"></p><div id="navVfrTable" style="overflow:auto"></div>';
el('adminWorkspace').append(panel);
function reset(kind){
 for(const id of kind==='airports'?['navAirportName','navAirportCity','navAirportIata','navAirportIcao','navAirportRunway','navAirportLat','navAirportLon']:['navVfrName','navVfrLat','navVfrLon'])el(id).value='';
 if(kind==='airports')airportEdit='';else vfrEdit='';
}
function edit(kind,code){
 const r=directory[kind][code];if(!r)return;
 if(kind==='airports'){airportEdit=code;for(const [field,value] of Object.entries({Name:r.name,City:r.city,Iata:r.iata,Icao:r.icao,Runway:r.runwayM,Lat:navDecimalToDms(r.lat,'lat'),Lon:navDecimalToDms(r.lon,'lon')}))el('navAirport'+field).value=value}
 else{vfrEdit=code;el('navVfrName').value=r.name;el('navVfrLat').value=navDecimalToDms(r.lat,'lat');el('navVfrLon').value=navDecimalToDms(r.lon,'lon')}
 el(kind==='airports'?'navAirportName':'navVfrName').focus();
}
window.saveNavigationForm=async function(kind){
 const status=el(kind==='airports'?'navAirportStatus':'navVfrStatus');
 if(!window.TWAAdminVerified||!window.TWAFirebase?.saveNavigationRecord){status.textContent='Authorized Admin sign-in is required.';return false}
 if(!navigator.onLine){status.textContent='Reconnect to save this shared directory entry.';return false}
 try{
  const airport=kind==='airports',prefix=airport?'navAirport':'navVfr';
  const r=validateRecord(kind,{name:el(prefix+'Name').value,city:airport?el(prefix+'City').value:undefined,iata:airport?el(prefix+'Iata').value:undefined,icao:airport?el(prefix+'Icao').value:undefined,runwayM:airport?el(prefix+'Runway').value:undefined,lat:navDmsToDecimal(el(prefix+'Lat').value,'lat'),lon:navDmsToDecimal(el(prefix+'Lon').value,'lon')});
  const code=airport?r.iata:r.name,editing=airport?airportEdit:vfrEdit;
  if(editing&&editing!==code)throw Error('The identifier cannot be changed while editing. Delete the old entry and add a new one after updating its routes.');
  if(!editing&&directory[kind][code])throw Error('This entry already exists. Use Edit to update it.');
  validateCollisions(kind,r);
  if(Object.keys(directory[kind]).length>=500&&!directory[kind][code])throw Error('This directory supports up to 500 entries of each type.');
  status.textContent='Saving shared directory entry…';
  await window.TWAFirebase.saveNavigationRecord(kind,code,r);
  applyNavigationDirectory({...directory,[kind]:{...directory[kind],[code]:r}});
  reset(kind);status.textContent=(airport?'Airport':'VFR point')+' saved to Firebase and available to online devices.';return true;
 }catch(error){status.textContent=error.message;return false}
};
window.removeNavigationRecord=async function(kind,code){
 const status=el(kind==='airports'?'navAirportStatus':'navVfrStatus');
 if(!window.TWAAdminVerified||!window.TWAFirebase?.saveNavigationRecord){status.textContent='Authorized Admin sign-in is required.';return false}
 const r=directory[kind][code];if(!r)return false;
 if(!navigator.onLine){status.textContent='Reconnect to remove this shared directory entry.';status.scrollIntoView({block:'center'});return false}
 const remains=kind==='airports'&&originalAirports.some(a=>a[0]===code);
 const referenced=Object.values(getHelicopterRoutes()).filter(route=>route?.codes?.includes(code));
 if(kind==='airports'&&!remains&&referenced.length){status.textContent='This airport is used by a saved helicopter route. Update or delete those routes first.';status.scrollIntoView({block:'center'});return false}
 if(!confirm('Remove '+code+' from the shared '+(kind==='airports'?'manual airport':'VFR point')+' directory?'+(kind==='vfrPoints'&&referenced.length?' Used by '+referenced.length+' saved route(s). These routes will require editing before they can be quoted.':'')))return false;
 try{
  await window.TWAFirebase.saveNavigationRecord(kind,code,null);
  applyNavigationDirectory({...directory,[kind]:{...directory[kind],[code]:null}});
  if((kind==='airports'?airportEdit:vfrEdit)===code)reset(kind);
  status.textContent=code+' removed from Firebase.'+(referenced.length?' Update the saved helicopter routes that use this point.':'');status.scrollIntoView({block:'center'});return true;
 }catch(error){status.textContent='Removal failed: '+error.message;status.scrollIntoView({block:'center'});return false}
};
window.drawNavigationAdmin=function(){
 for(const [kind,id] of [['airports','navAirportTable'],['vfrPoints','navVfrTable']]){
  const rows=Object.entries(directory[kind]).sort(([a],[b])=>a.localeCompare(b)),target=el(id);
  target.innerHTML='<table><thead><tr><th>'+(kind==='airports'?'Airport / City':'Name VFR')+'</th><th>'+(kind==='airports'?'IATA / ICAO · Runway':'Type')+'</th><th>Coordinates · DMS</th><th>Actions</th></tr></thead><tbody>'+rows.map(([code,r],i)=>'<tr><td>'+esc(kind==='airports'?r.name+' · '+r.city:r.name)+'</td><td>'+esc(kind==='airports'?r.iata+' / '+r.icao+' · '+r.runwayM+' m':'VFR waypoint')+'</td><td>'+esc(navDecimalToDms(r.lat,'lat'))+'<br>'+esc(navDecimalToDms(r.lon,'lon'))+'</td><td><button type="button" data-edit="'+i+'" class="btn secondary">Edit</button> <button type="button" data-delete="'+i+'" class="btn secondary">Delete</button></td></tr>').join('')+(rows.length?'':'<tr><td colspan="4">No manual entries saved.</td></tr>')+'</tbody></table>';
  target.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>edit(kind,rows[Number(button.dataset.edit)][0]));
  target.querySelectorAll('[data-delete]').forEach(button=>button.onclick=()=>removeNavigationRecord(kind,rows[Number(button.dataset.delete)][0]));
 }
};
el('navAirportSave').onclick=()=>saveNavigationForm('airports');el('navVfrSave').onclick=()=>saveNavigationForm('vfrPoints');
el('navAirportReset').onclick=()=>reset('airports');el('navVfrReset').onclick=()=>reset('vfrPoints');
const sync=window.syncAdminView;window.syncAdminView=function(){sync();if(window.TWAAdminVerified)drawNavigationAdmin()};
const sequence=el('heliRouteSequence'),wrap=document.createElement('div'),menu=document.createElement('div');
wrap.className='airport-search-wrap';menu.className='airport-suggestions';menu.id='heliRoutePointSuggestions';menu.hidden=true;menu.setAttribute('role','listbox');sequence.before(wrap);wrap.append(sequence,menu);sequence.setAttribute('aria-controls',menu.id);sequence.setAttribute('aria-autocomplete','list');
function closeMenu(){menu.hidden=true;sequence.setAttribute('aria-expanded','false')}
function suggest(){
 const value=sequence.value.toUpperCase(),match=value.match(/^(.*[,;>→–—-])?([^,;>→–—-]*)$/),prefix=match?.[1]||'',q=(match?.[2]||'').trim();
 menu.replaceChildren();if(!q){closeMenu();return}
 const candidates=[...airportData.map(a=>({code:a[0],label:a[2],extra:a[0]+' / '+a[1]})),...Object.values(directory.vfrPoints).map(r=>({code:r.name,label:r.name+' · VFR point',extra:navDecimalToDms(r.lat,'lat')+' · '+navDecimalToDms(r.lon,'lon')}))].filter(r=>(r.code+' '+r.label+' '+r.extra).toUpperCase().includes(q)).slice(0,12);
 for(const r of candidates){const button=document.createElement('button');button.type='button';button.className='airport-suggestion';button.setAttribute('role','option');const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=r.label;detail.textContent=r.extra;button.append(title,detail);button.addEventListener('pointerdown',e=>e.preventDefault());button.onclick=()=>{sequence.value=prefix+r.code+'-';closeMenu();sequence.focus()};menu.append(button)}
 menu.hidden=!candidates.length;sequence.setAttribute('aria-expanded',String(!!candidates.length));
}
sequence.addEventListener('input',suggest);sequence.addEventListener('focus',suggest);sequence.addEventListener('blur',()=>setTimeout(closeMenu,160));sequence.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();if(event.key==='Enter'&&!menu.hidden){event.preventDefault();menu.querySelector('button')?.click()}});

panel.insertAdjacentHTML('beforeend','<h4>Import VFR Points · Up to 400 Points</h4><p class="small">Paste up to 400 points: name, latitude, longitude. Separate lines or a single paragraph are accepted. Coordinates are read automatically. Review the preview, then import all points together. Names may contain spaces; an optional VFR suffix is ignored. Existing names will be updated.</p><label for="navVfrBulkInput">VFR points · name and DMS coordinates</label><textarea id="navVfrBulkInput" rows="7" spellcheck="false" placeholder="PIMAL S06 15&#39;58&quot; E106 47&#39;08&quot;&#10;GUSAN S05 46&#39;00&quot; E105 47&#39;05&quot;"></textarea><p id="navVfrBulkStatus" class="small" role="status" aria-live="polite"></p><div id="navVfrBulkPreview" style="overflow:auto"></div><div class="actions"><button id="navVfrBulkSave" class="btn" type="button" disabled>Import VFR Points</button></div>');
let bulkSaving=false;
window.parseVFRBulkInput=function(text){
 const source=String(text||'').replace(/\u00a0/g,' ').trim().toUpperCase(),records=[],names=new Set();
 // Locate complete coordinate pairs instead of relying on line breaks retained by copy/paste.
 const dms=hemisphere=>hemisphere+String.raw`\s*\d{1,3}(?:\s*°\s*|\s+)\d{1,2}(?:\s*['\u2032\u2019]\s*|\s+)\d{1,2}(?:[.,]\d+)?\s*["\u2033\u201d]?`;
 const pairs=new RegExp('('+dms('[NS]')+')[\\s,;]+('+dms('[EW]')+')','g');
 let cursor=0,match;
 while((match=pairs.exec(source))){
  const number=records.length+1,line=source.slice(0,match.index).split(/\r\n|[\r\n]/).length;
  try{
   const rawName=source.slice(cursor,match.index).trim().replace(cursor?/^VFR(?:\s+|$)/:/^$/,'').trim().replace(/^[,;]+\s*/,'').trim();
   const r=validateRecord('vfrPoints',{name:rawName,lat:navDmsToDecimal(match[1],'lat'),lon:navDmsToDecimal(match[2],'lon')});
   validateCollisions('vfrPoints',r);
   if(names.has(r.name))throw Error('Duplicate point '+r.name+'.');
   if(number>400)throw Error('Import up to 400 VFR points at once. Split larger lists into batches.');
   names.add(r.name);records.push(r);cursor=pairs.lastIndex;
  }catch(error){throw Error('Point '+number+' (line '+line+'): '+error.message)}
 }
 const tail=source.slice(cursor).trim();
 if(!records.length||tail&&!/^VFR$/.test(tail))throw Error('Incomplete VFR data. Use NAME S06 15\'58" E106 47\'08". Points may be on separate lines or in one paragraph.');
 if(new Set([...Object.keys(directory.vfrPoints),...names]).size>500)throw Error('The shared VFR directory supports up to 500 points. Remove unused points before importing.');
 return records;
};
function previewBulk(){
 const button=el('navVfrBulkSave'),status=el('navVfrBulkStatus'),preview=el('navVfrBulkPreview');
 try{
  const records=parseVFRBulkInput(el('navVfrBulkInput').value);
  preview.innerHTML='<table><thead><tr><th>Name VFR</th><th>Latitude</th><th>Longitude</th><th>Action</th></tr></thead><tbody>'+records.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+esc(navDecimalToDms(r.lat,'lat'))+'</td><td>'+esc(navDecimalToDms(r.lon,'lon'))+'</td><td>'+(directory.vfrPoints[r.name]?'Update':'Add')+'</td></tr>').join('')+'</tbody></table>';
  status.textContent=records.length+' points detected. Review coordinates before importing.';button.disabled=bulkSaving;return records;
 }catch(error){preview.replaceChildren();status.textContent=el('navVfrBulkInput').value.trim()?error.message:'';button.disabled=true;return null}
}
window.importVFRBulkInput=async function(){
 if(bulkSaving)return false;
 const status=el('navVfrBulkStatus');
 if(!window.TWAAdminVerified||!window.TWAFirebase?.saveVFRPoints){status.textContent='Authorized Admin sign-in is required.';return false}
 if(!navigator.onLine){status.textContent='Reconnect to import shared VFR points.';return false}
 const records=previewBulk();if(!records)return false;
 bulkSaving=true;el('navVfrBulkSave').disabled=true;el('navVfrBulkInput').disabled=true;status.textContent='Saving '+records.length+' VFR points to Firebase…';
 try{
  await window.TWAFirebase.saveVFRPoints(records);
  applyNavigationDirectory({...directory,vfrPoints:{...directory.vfrPoints,...Object.fromEntries(records.map(r=>[r.name,r]))}});
  status.textContent=records.length+' VFR points saved to Firebase and available to online devices.';return true;
 }catch(error){status.textContent='Import failed: '+error.message;return false}
 finally{bulkSaving=false;el('navVfrBulkInput').disabled=false;el('navVfrBulkSave').disabled=false}
};
el('navVfrBulkInput').addEventListener('input',previewBulk);
el('navVfrBulkSave').onclick=()=>importVFRBulkInput();

try{applyNavigationDirectory(JSON.parse(tenantStorage.getItem('twaNavigationDirectoryV1')||'{}'))}catch(error){applyNavigationDirectory({})}
drawNavigationAdmin();
})();
