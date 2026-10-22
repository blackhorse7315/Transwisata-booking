/* Structured multi-city charter itinerary. */
(function(){
'use strict';
const el=id=>document.getElementById(id),MAX=8;
const original={trip:window.trip,price:window.priceForAircraft,calculate:window.calculateEstimate,render:window.renderFleetPrices,details:window.showPriceDetails,next:window.next,track:window.track,payment:window.renderPaymentSummary};
let nextId=2,rows=[],mounted=false;
const firstFields=['from','to','date','time'].map(id=>{const field=el(id),holder=field.closest('.airport-search-wrap')?.parentElement||field.parentElement,marker=document.createComment('multi-city-'+id);holder.before(marker);return {id,holder,marker}});
const style=document.createElement('style');
style.textContent='#multiCityEditor{margin-top:22px}#multiCityEditor .mc-card{border:1px solid #d7e5ef;border-radius:20px;background:#fff;box-shadow:0 7px 20px #12345212;margin:0 0 18px}.mc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 20px;background:linear-gradient(100deg,#d9f1ff,#f7fcff);border-radius:20px 20px 0 0;color:#163750}.mc-head h3{margin:0;font-size:20px}.mc-remove{border:0;background:transparent;color:#8a2c30;padding:8px;cursor:pointer}.mc-fields{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:16px;padding:20px}.mc-field{min-width:0}.mc-fields label{font-size:12px}.mc-fields input{min-height:48px}.mc-swap{align-self:center;border:0;border-radius:12px;background:#eef7fd;color:#145c8a;padding:10px;font-size:21px;cursor:pointer}.mc-date{grid-column:1/3}.mc-time{grid-column:3}.mc-add{width:100%;padding:17px;border:1px solid #cbe1ee;background:white;color:#126599;font-weight:800;font-size:17px;border-radius:16px;cursor:pointer}.mc-search{width:100%;margin-top:18px;min-height:50px}.mc-error{color:#a32b26;font-size:13px;line-height:1.5}.mc-itinerary{margin:12px 0;padding:12px;background:#f0f7fc;border-radius:12px}@media(max-width:650px){.mc-fields{grid-template-columns:minmax(0,1fr) 46px;gap:12px;padding:17px}.mc-origin{grid-column:1;grid-row:1}.mc-destination{grid-column:1;grid-row:2}.mc-swap{grid-column:2;grid-row:1/3}.mc-date{grid-column:1/3}.mc-time{grid-column:1/3}.mc-head{padding:14px 17px}}';
document.head.append(style);
const editor=document.createElement('section');editor.id='multiCityEditor';editor.className='hidden';editor.innerHTML='<div id="multiCityFlights"></div><button type="button" id="multiCityAdd" class="mc-add">Add another flight ＋</button><p class="small">Enter each flight separately. Prices include all flights below. Connecting aircraft positioning between different airports is included automatically.</p><p id="multiCityError" class="mc-error" role="status" aria-live="polite"></p><button type="button" class="btn mc-search" id="multiCitySearch">Search flights</button>';
el('multi').after(editor);
function dayLabel(value){return value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'Select date'}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function bindAirport(input){
 input.autocomplete='off';input.setAttribute('aria-autocomplete','list');
 const wrap=document.createElement('div'),menu=document.createElement('div');wrap.className='airport-search-wrap';menu.className='airport-suggestions';menu.id=input.id+'Suggestions';menu.hidden=true;menu.setAttribute('role','listbox');
 input.before(wrap);wrap.append(input,menu);input.setAttribute('aria-controls',menu.id);
 const close=()=>{menu.hidden=true;input.setAttribute('aria-expanded','false')};
 const refresh=()=>{const q=input.value.trim().toLowerCase();menu.replaceChildren();if(!q){close();return}
  const matches=airportData.filter(a=>[a[0],a[1],a[2]].some(v=>v.toLowerCase().includes(q))).slice(0,12);
  for(const a of matches){const button=document.createElement('button');button.type='button';button.className='airport-suggestion';button.setAttribute('role','option');const title=document.createElement('strong'),sub=document.createElement('small');title.textContent=a[2];sub.textContent=a[0]+' / '+a[1];button.append(title,sub);button.addEventListener('pointerdown',e=>e.preventDefault());button.onclick=()=>{input.value=a[0];close();changed();input.blur()};menu.append(button)}
  menu.hidden=!matches.length;input.setAttribute('aria-expanded',String(!!matches.length));
 };
 input.addEventListener('input',refresh);input.addEventListener('focus',refresh);input.addEventListener('blur',()=>setTimeout(close,160));input.addEventListener('keydown',event=>{if(event.key==='Escape')close();if(event.key==='ArrowDown'&&!menu.hidden){event.preventDefault();menu.querySelector('button')?.focus()}if(event.key==='Enter'&&!menu.hidden){event.preventDefault();menu.querySelector('button')?.click()}});
}
function field(label,id,type,cls,value=''){
 const holder=document.createElement('div');holder.className='mc-field '+cls;
 const caption=document.createElement('label');caption.htmlFor=id;caption.textContent=label;
 const input=document.createElement('input');input.id=id;input.type=type;input.value=value;
 if(type==='text')input.placeholder=cls==='mc-origin'?'Select origin city/airport':'Select destination city/airport';
 if(type==='date')input.min=today();
 holder.append(caption,input);if(type==='text')bindAirport(input);return holder;
}
function mountFirst(){for(const f of firstFields){f.holder.classList.add('mc-field',f.id==='from'?'mc-origin':f.id==='to'?'mc-destination':f.id==='date'?'mc-date':'mc-time');rows[0].node.querySelector('.mc-fields').append(f.holder)}}
function card(first=false,seed={}){
 const id=first?1:nextId++,node=document.createElement('article');node.className='mc-card';
 node.innerHTML='<div class="mc-head"><h3></h3><button type="button" class="mc-remove">Remove</button></div><div class="mc-fields"></div>';
 const area=node.querySelector('.mc-fields'),ids=first?{from:'from',to:'to',date:'date',time:'time'}:{from:'mcFrom'+id,to:'mcTo'+id,date:'mcDate'+id,time:'mcTime'+id};
 if(!first)area.append(field('Departure Airport / Location',ids.from,'text','mc-origin',seed.from),field('Destination Airport / Location',ids.to,'text','mc-destination',seed.to),field('Departure Date',ids.date,'date','mc-date',seed.date),field('Departure Time (Local)',ids.time,'time','mc-time',seed.time||'09:00'));
 const swap=document.createElement('button');swap.type='button';swap.className='mc-swap';swap.textContent='⇅';swap.onclick=()=>{const a=el(ids.from),b=el(ids.to);[a.value,b.value]=[b.value,a.value];changed()};area.append(swap);
 const row={id,node,ids};node.querySelector('.mc-remove').onclick=()=>{if(rows.length<=2)return;rows=rows.filter(r=>r!==row);node.remove();renumber();changed()};
 rows.push(row);el('multiCityFlights').append(node);if(first)mountFirst();renumber();return row;
}
function renumber(){rows.forEach((r,i)=>{r.node.querySelector('h3').textContent='Flight '+(i+1);const remove=r.node.querySelector('.mc-remove');remove.hidden=i===0||rows.length<=2;remove.setAttribute('aria-label','Remove Flight '+(i+1));r.node.querySelector('.mc-swap').setAttribute('aria-label','Swap departure and destination for Flight '+(i+1))});el('multiCityAdd').disabled=rows.length>=MAX}
window.getMultiCityFlights=()=>rows.map(r=>Object.fromEntries(Object.entries(r.ids).map(([key,id])=>[key,el(id).value.trim()])));
function problem(){
 const flights=getMultiCityFlights();if(flights.length<2)return 'Add at least two flights.';
 for(let i=0;i<flights.length;i++){const f=flights[i],a=airportMatch(f.from),b=airportMatch(f.to);
  if(!a||!b||a===b)return 'Flight '+(i+1)+': select different supported origin and destination airports.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date)||f.date<today()||!f.time)return 'Flight '+(i+1)+': enter a valid departure date and time.';
  if(i&&f.date<flights[i-1].date)return 'Flight '+(i+1)+': departure date must follow the previous flight.';
  if(i&&f.date===flights[i-1].date&&f.time<=flights[i-1].time)return 'Flight '+(i+1)+': departure time must be later than the previous flight on the same date.';
 }
 return '';
}
function serialize(){el('stops').value=JSON.stringify({version:1,flights:getMultiCityFlights().map(f=>({...f,from:airportMatch(f.from)?.[0]||f.from,to:airportMatch(f.to)?.[0]||f.to}))})}
window.validateMultiCity=function(show=false){const error=problem();if(show)el('multiCityError').textContent=error;if(!error)serialize();return !error};
function changed(){if(currentTrip!=='Multi City')return;serialize();window.calculateEstimate()}
editor.addEventListener('input',changed);editor.addEventListener('change',changed);
el('multiCityAdd').onclick=()=>{if(rows.length>=MAX)return;const last=getMultiCityFlights().at(-1);card(false,{from:last?.to||'',date:last?.date||''});changed();rows.at(-1).node.scrollIntoView({behavior:'smooth',block:'center'})};
el('multiCitySearch').onclick=()=>{if(!validateMultiCity(true))return;window.calculateEstimate();el('fleet').scrollIntoView({behavior:'smooth',block:'start'})};
window.trip=function(t,b){
 original.trip(t,b);
 const active=t==='Multi City';editor.classList.toggle('hidden',!active);el('multi').classList.add('hidden');
 if(active&&!mounted){if(rows.length)mountFirst();else{card(true);card(false,{from:el('to').value})}mounted=true}
 if(!active&&mounted){for(const f of firstFields){f.marker.after(f.holder);f.holder.classList.remove('mc-field','mc-origin','mc-destination','mc-date','mc-time')}mounted=false}
 if(active)el('contact').classList.add('hidden');
 window.calculateEstimate();
};
window.priceForAircraft=function(name,sector=null){
 if(currentTrip!=='Multi City'||sector)return original.price(name,sector);
 if(problem())return null;
 const flights=getMultiCityFlights(),quotes=flights.map(f=>original.price(name,f)),positions=[];
 for(let i=1;i<flights.length;i++)if(airportMatch(flights[i-1].to)!==airportMatch(flights[i].from)){const f={from:flights[i-1].to,to:flights[i].from,date:flights[i].date,time:flights[i].time};positions.push({flight:i+1,sector:f,quote:original.price(name,f)})}
 if(quotes.some(q=>!q)||positions.some(p=>!p.quote))return null;
 const all=[...quotes,...positions.map(p=>p.quote)],dayHours={};
 quotes.forEach((q,i)=>{dayHours[flights[i].date]=(dayHours[flights[i].date]||0)+q.hours});
 positions.forEach(p=>{dayHours[p.sector.date]=(dayHours[p.sector.date]||0)+p.quote.hours});
 if(isHelicopter(name)&&Object.values(dayHours).some(h=>h>planningLimits[name].daily+1e-9))return null;
 const a=assumptions[name],positioning=num('positioning'),hours=all.reduce((s,q)=>s+q.hours,0);
 const names=quotes[0].items.slice(0,-2).map(x=>x[0]),items=names.map((label,i)=>[label,all.reduce((sum,q)=>sum+q.items[i][1],0)]);
 items[0][1]+=positioning*a.rate;items[1][1]+=positioning*a.burn*num('fuelPrice');
 items[4][1]=num('parkingDays')*num('parking');items[5][1]+=positioning*num('navFee');
 items[6][1]=num('crewDays')*num('crew');items[7][1]=num('otherFees');
 const subtotal=items.reduce((s,x)=>s+x[1],0),service=subtotal*num('service')/100,tax=(subtotal+service)*num('tax')/100;
 items.push(['Service charge',service],['Tax (indicative)',tax]);
 return {items,total:subtotal+service+tax,hours,totalHours:hours+positioning,nm:all.reduce((s,q)=>s+q.nm,0),legs:flights.length,sectors:all.reduce((s,q)=>s+q.sectors,0),plan:null,quotes,positions,flights,route:quotes.map((q,i)=>'Flight '+(i+1)+': '+q.route).join(' | ')};
};
window.calculateEstimate=function(){
 if(currentTrip!=='Multi City')return original.calculate();
 const error=problem();el('multiCityError').textContent=error;serialize();
 const name=el('plane').value||aircraft[0][0],p=window.priceForAircraft(name);
 if(!p){el('flightHours').value='';el('costRows').replaceChildren();el('grandTotal').textContent='Complete all flights';lastEstimate=null;window.renderFleetPrices();return}
 el('flightHours').value=p.hours.toFixed(2);el('flightTimeInfo').textContent=timeLabel(p.hours)+' total airborne across '+p.legs+' flights';
 el('costNote').textContent='Estimate includes every entered flight and proposed refuel sectors. Schedules, ground time and overnight arrangements require Operations confirmation.';
 el('costRows').innerHTML=p.items.map(x=>'<div class="costrow"><span>'+esc(x[0])+'</span><strong>'+formatPrice(x[1])+'</strong></div>').join('');
 el('grandTotal').textContent=formatPrice(p.total);
 lastEstimate={totalUSD:p.total,currency:el('currency').value,formatted:formatPrice(p.total),hours:p.totalHours,breakdown:p.items,route:p.route,flights:p.flights};
 window.renderFleetPrices();
};
window.renderFleetPrices=function(){
 original.render();if(currentTrip!=='Multi City')return;
 const flights=getMultiCityFlights(),summary=el('fleetRouteSummary'),valid=!problem();
 if(!valid){summary.classList.remove('premium-route');summary.textContent='Complete all Multi City flights to compare total prices.'}
 else {const final=airportMatch(flights.at(-1).to);el('routeDestName').textContent=final[2];el('routeDestCode').textContent=[final[0],final[1]].join(' / ');el('routeDistance').textContent=flights.reduce((s,f)=>s+distanceNM(airportMatch(f.from),airportMatch(f.to)),0).toFixed(1)+' NM · '+flights.length+' flights';el('routeDate').textContent=dayLabel(flights[0].date)+(flights.at(-1).date!==flights[0].date?' – '+dayLabel(flights.at(-1).date):'')}
 document.querySelectorAll('#fleet .aircraft').forEach((card,i)=>{const name=aircraft[i][0],p=window.priceForAircraft(name),meta=card.querySelector('.fleet-meta');
 if(p)meta.textContent='Estimated total · '+timeLabel(p.hours)+' airborne · '+p.legs+' flights'+(p.positions.length?' + '+p.positions.length+' positioning':'')+' · '+p.nm.toFixed(0)+' NM';
 else if(valid)meta.textContent=isHelicopter(name)?'Route unavailable or combined daily flight limit exceeded ('+planningLimits[name].daily+' h/day). Adjust the flight dates or routing.':'Route unavailable.';
 });
};
function itineraryHTML(flights){return '<div class="mc-itinerary">'+flights.map((f,i)=>'<p><strong>Flight '+(i+1)+': '+esc(f.from)+' → '+esc(f.to)+'</strong><br><span class="small">'+esc(dayLabel(f.date))+' · '+esc(f.time)+' local</span></p>').join('')+'</div>'}
window.bookingRouteHTML=function(b){let extra='';if(b.trip==='Multi City'){try{const parsed=JSON.parse(b.stops);if(Array.isArray(parsed.flights))extra='<details><summary>View all flights</summary>'+itineraryHTML(parsed.flights)+'</details>'}catch{}}
 return esc(b.from)+' → '+esc(b.to)+extra;
};
window.showPriceDetails=function(index){
 if(currentTrip!=='Multi City')return original.details(index);
 const entry=aircraft[index],p=entry&&window.priceForAircraft(entry[0]);if(!p){validateMultiCity(true);if(!el('multiCityError').textContent)el('multiCityError').textContent='This aircraft cannot cover the itinerary within its route or daily flight limits.';el('multiCityError').scrollIntoView({block:'center',behavior:'smooth'});return}
 el('priceModalTitle').textContent=entry[0]+' · '+entry[2];
 el('priceModalContent').innerHTML='<h3>Multi City itinerary</h3>'+itineraryHTML(p.flights)+p.quotes.map((q,i)=>'<details'+(i===0?' open':'')+'><summary>Flight '+(i+1)+': '+esc(q.route)+' · '+timeLabel(q.hours)+'</summary><div class="route-map">'+offlineMap(q.plan?q.plan.points:[airportMatch(p.flights[i].from),airportMatch(p.flights[i].to)])+'</div>'+(q.plan?routePlanningHTML(q.plan):'')+'</details>').join('')+p.positions.map(pos=>'<p class="mc-itinerary"><strong>Aircraft positioning before Flight '+pos.flight+': '+esc(pos.quote.route)+'</strong><br>'+timeLabel(pos.quote.hours)+' · included in total</p>').join('')+'<h3>All flights · estimated price breakdown</h3>'+p.items.map(x=>'<div class="costrow"><span>'+esc(x[0])+'</span><strong>'+formatPrice(x[1])+'</strong></div>').join('')+'<div class="modal-total">Estimated total: '+formatPrice(p.total)+'</div><p class="small">Includes all entered flights and proposed refuel sectors. Confirm schedules, aircraft performance, fuel supply, ground time, overnight costs and permits with Operations.</p>';
 el('modalBookButton').onclick=()=>{closePriceDetails();choose(entry[0])};el('priceModal').classList.remove('hidden');
};
window.next=function(){if(currentTrip==='Multi City'){if(!validateMultiCity(true))return;if(+el('pax').value<1)return alert('Enter a valid passenger count.');if(!window.priceForAircraft(el('plane').value||aircraft[0][0]))return alert('Adjust the itinerary or aircraft to meet route and daily flight limits.');el('contact').classList.remove('hidden');el('contact').scrollIntoView({behavior:'smooth'});return}return original.next()};
window.renderPaymentSummary=function(){original.payment();const b=getData().find(x=>x.ref===activePaymentRef);if(b?.trip==='Multi City')el('paymentSummary').insertAdjacentHTML('beforeend',bookingRouteHTML(b))};
window.track=function(){original.track();const b=getData().find(x=>x.ref.toUpperCase()===el('reference').value.trim().toUpperCase());if(b?.trip==='Multi City')el('tracking').insertAdjacentHTML('beforeend',bookingRouteHTML(b))};
['from','to','date','time'].forEach(id=>el(id).addEventListener('input',changed));
})();
