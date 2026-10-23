/* Company minimum-runway screening for fixed-wing charter requests. */
(function(){
'use strict';
const el=id=>document.getElementById(id);
const baseline={'Gulfstream IV-SP':1600,'King Air 350i':1000,'CASA 212-200':800};
window.defaultMinimumRunway=name=>baseline[name]||0;
window.minimumRunwayFor=function(name){
 if(isHelicopter(name))return 0;
 const aircraftConfig=window.TWACustomFleet?.find(r=>r.name===name);
 return Math.max(baseline[name]||0,Number(aircraftConfig?.minimumRunwayM)||0);
};
const reference=()=>window.TWARunwayReference||{airports:{},sourceDate:'unavailable'};
function airportsFor(sector){
 const flights=sector?[sector]:currentTrip==='Multi City'&&window.getMultiCityFlights?getMultiCityFlights():[{from:el('from').value,to:el('to').value}];
 return [...new Map(flights.flatMap(f=>[airportMatch(f.from),airportMatch(f.to)]).filter(Boolean).map(a=>[a[0],a])).values()];
}
window.checkRunwayCompatibility=function(name,sector=null){
 if(isHelicopter(name))return {eligible:true,applicable:false,issues:[],airports:[]};
 const minimum=minimumRunwayFor(name),airports=airportsFor(sector),issues=[];
 if(!minimum)issues.push({kind:'configuration',message:'The minimum runway requirement for '+name+' has not been configured. Operations verification is required before this aircraft can be selected.'});
 for(const airport of airports){
  const record=reference().airports[airport[0]],lengths=(record?.runways||[]).map(r=>Number(r.lengthM)).filter(n=>Number.isFinite(n)&&n>0),longest=lengths.length?Math.max(...lengths):null;
  const airportName=airport[2]+' ('+airport[0]+' / '+airport[1]+')';
  if(record?.status==='closed')issues.push({airport:airport[0],kind:'closed',message:airportName+' is listed as closed in the airport reference. This aircraft cannot be selected for this route pending Operations verification.'});
  else if(!longest)issues.push({airport:airport[0],kind:'unknown',message:'Runway length at '+airportName+' is not available in the current reference. Operations must verify a runway of at least '+minimum.toLocaleString('en-US')+' m before '+name+' can be selected.'});
  else if(longest<minimum)issues.push({airport:airport[0],kind:'short',lengthM:longest,minimumM:minimum,message:name+' is not available for this route. The longest listed open runway at '+airportName+' is '+longest.toLocaleString('en-US')+' m, below the company minimum of '+minimum.toLocaleString('en-US')+' m for take-off and landing. Please select a suitable aircraft or an alternative airport.'});
 }
 return {eligible:!issues.length,applicable:true,minimumM:minimum,issues,airports};
};
function markup(check){
 const title=check.issues.some(i=>i.kind==='short')?'Runway requirement not met':check.issues.some(i=>i.kind==='closed')?'Airport unavailable':'Runway verification required';
 return '<div class="runway-notice" role="status"><strong>'+(!check.eligible?title:'Minimum runway: '+check.minimumM.toLocaleString('en-US')+' m')+'</strong>'+check.issues.map(i=>'<p>'+esc(i.message)+'</p>').join('')+'</div>';
}
function details(check){
 return markup(check)+'<p class="small">Runway-length screening uses the longest open runway listed in '+esc(reference().source)+' (snapshot '+esc(reference().sourceDate)+'). This company minimum does not establish take-off or landing performance approval. Operations must verify current AIP/NOTAM, declared distances, runway condition, aircraft weight, weather and performance before flight.</p>';
}
function guard(name){
 const check=checkRunwayCompatibility(name);if(check.eligible)return true;
 showNotice(name,check);return false;
}
window.runwayAllowsBooking=guard;
function showNotice(name,check){
 el('priceModalTitle').textContent=name+' · Runway assessment';
 el('priceModalContent').innerHTML=details(check);el('modalBookButton').hidden=true;el('priceModal').classList.remove('hidden');
}
const style=document.createElement('style');style.textContent='.runway-notice{margin:12px 0;padding:13px;border:1px solid #e6be85;border-radius:12px;background:#fff7e9;color:#76451e;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.runway-notice strong{display:block;font-size:13px}.runway-notice p{margin:7px 0 0!important;font-size:12px!important;color:inherit!important}.runway-minimum{font-size:11px;color:#52667d;margin-top:10px}#runwaySelectedNotice:empty{display:none}';
document.head.append(style);
const selected=document.createElement('div');selected.id='runwaySelectedNotice';selected.setAttribute('aria-live','polite');el('holdNotice').before(selected);
const render=window.renderFleetPrices,show=window.showPriceDetails,next=window.next,calculate=window.calculateEstimate;
window.renderFleetPrices=function(){
 render();
 document.querySelectorAll('#fleet .aircraft').forEach((card,i)=>{
  const name=aircraft[i][0],check=checkRunwayCompatibility(name);card.querySelector('.runway-assessment')?.remove();
  if(!check.applicable)return;
  const note=document.createElement('div');note.className='runway-assessment';
  if(check.airports.length&&!check.eligible){
   note.innerHTML=markup(check);
   const price=card.querySelector('.fleet-price');if(price)price.textContent='Route not available';
   const meta=card.querySelector('.fleet-meta');if(meta)meta.textContent=check.issues.some(i=>i.kind==='short')?'The runway is shorter than the company minimum.':'Runway details require Operations verification.';
  }else note.innerHTML='<div class="runway-minimum">Minimum runway: '+check.minimumM.toLocaleString('en-US')+' m</div>';
  card.querySelector('.details').append(note);
 });
 for(const option of el('plane').options)if(option.value){const check=checkRunwayCompatibility(option.value);option.disabled=check.applicable&&check.airports.length>0&&!check.eligible;option.title=check.issues.map(i=>i.message).join('\n')}
 const name=el('plane').value,check=name?checkRunwayCompatibility(name):null;
 selected.innerHTML=check?.applicable&&check.airports.length&&!check.eligible?markup(check):'';
 if(check&&!check.eligible){el('contact').classList.add('hidden');lastEstimate=null}
};
window.calculateEstimate=function(){
 calculate();
 const chosen=el('plane').value;if(chosen&&!checkRunwayCompatibility(chosen).eligible){lastEstimate=null;el('grandTotal').textContent='Runway verification required'}
};
window.showPriceDetails=function(index){
 const name=aircraft[index]?.[0];if(!name)return;
 const check=checkRunwayCompatibility(name);
 if(check.applicable&&check.airports.length&&!check.eligible){showNotice(name,check);return}
 el('modalBookButton').hidden=false;show(index);
 if(check.applicable&&check.airports.length)el('priceModalContent').insertAdjacentHTML('beforeend',details(check));
};
window.next=function(){const name=el('plane').value;if(name&&!guard(name))return;return next()};
window.renderFleetPrices();
})();
