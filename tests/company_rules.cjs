const fs=require('node:fs');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,runTransaction,serverTimestamp}=require('firebase/firestore');
(async()=>{
 const source=fs.readFileSync('firestore.rules','utf8');
 const env=await initializeTestEnvironment({projectId:'demo-company-builder',firestore:{rules:source,host:'127.0.0.1',port:8080}});
 try{
  const root=env.authenticatedContext('9AM94kN7gba5U4Si7BmARpXnstD3').firestore();
  const admin=env.authenticatedContext('cIHf6R5zNST1vjwa64zxTgyladm1').firestore();
  const visitor=env.authenticatedContext('visitor-a').firestore();
  const other=env.authenticatedContext('visitor-b').firestore();
  const guest=env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'publicSettings','bookingApp'),{customization:{fleetByReg:{'ZZ-TEST':{name:'Demo Helicopter',active:true}}},costs:{}}));
  await assertSucceeds(getDoc(doc(guest,'publicSettings','bookingApp')));
  await assertSucceeds(getDoc(doc(admin,'privateAdmin','accessCheck')));
  await assertSucceeds(getDoc(doc(root,'privateAdmin','accessCheck')));
  await assertFails(getDoc(doc(admin,'privateSuperAdmin','accessCheck')));
  await assertSucceeds(getDoc(doc(root,'privateSuperAdmin','accessCheck')));
  await assertFails(updateDoc(doc(admin,'publicSettings','bookingApp'),{customization:{companyName:'Forbidden'}}));
  await assertFails(updateDoc(doc(visitor,'publicSettings','bookingApp'),{customization:{companyName:'Forbidden'}}));
  await assertSucceeds(updateDoc(doc(admin,'publicSettings','bookingApp'),{costs:{fuelPrice:5}}));
  const settings=doc(admin,'publicSettings','bookingApp');
  await assertSucceeds(setDoc(settings,{navigationDirectory:{airports:{ZQA:{name:'Fixture Airport',city:'Fixture City',iata:'ZQA',icao:'WAQA',runwayM:1200,lat:-6.5,lon:106.75}}}},{mergeFields:['navigationDirectory.airports.ZQA']}));
  await assertSucceeds(setDoc(settings,{navigationDirectory:{vfrPoints:{PIMOL:{name:'PIMOL',lat:-6.2,lon:106.6}}}},{mergeFields:['navigationDirectory.vfrPoints.PIMOL']}));
  await assertFails(setDoc(doc(visitor,'publicSettings','bookingApp'),{navigationDirectory:{vfrPoints:{BADFIX:{name:'BADFIX',lat:0,lon:0}}}},{mergeFields:['navigationDirectory.vfrPoints.BADFIX']}));
  const publicDirectory=(await assertSucceeds(getDoc(doc(guest,'publicSettings','bookingApp')))).data().navigationDirectory;
  if(!publicDirectory.airports.ZQA||!publicDirectory.vfrPoints.PIMOL||publicDirectory.vfrPoints.BADFIX)throw Error('Navigation fields or access not preserved');
  const batch={'ABEAM PLM':{name:'ABEAM PLM',lat:-3.0225,lon:104.2222},PIMAL:{name:'PIMAL',lat:-6.2661,lon:106.7856},GUSAN:{name:'GUSAN',lat:-5.7667,lon:105.7847}};
  const masks=Object.keys(batch).map(code=>'navigationDirectory.vfrPoints.'+code);
  await assertSucceeds(setDoc(settings,{navigationDirectory:{vfrPoints:batch}},{mergeFields:masks}));
  await assertFails(setDoc(doc(visitor,'publicSettings','bookingApp'),{navigationDirectory:{vfrPoints:batch}},{mergeFields:masks}));
  const imported=(await assertSucceeds(getDoc(doc(guest,'publicSettings','bookingApp')))).data().navigationDirectory;
  if(!imported.airports.ZQA||!imported.vfrPoints.PIMOL||!imported.vfrPoints.PIMAL||!imported.vfrPoints.GUSAN||!imported.vfrPoints['ABEAM PLM'])throw Error('Bulk VFR import overwrote shared directory');
  await assertSucceeds(setDoc(settings,{navigationDirectory:{vfrPoints:{PIMOL:null}}},{mergeFields:['navigationDirectory.vfrPoints.PIMOL']}));
  const deleted=(await assertSucceeds(getDoc(doc(guest,'publicSettings','bookingApp')))).data().navigationDirectory;
  if(deleted.vfrPoints.PIMOL!==null||!deleted.vfrPoints['ABEAM PLM']||!deleted.airports.ZQA)throw Error('VFR deletion did not preserve other entries');
  const bulk400=Object.fromEntries(Array.from({length:400},(_,i)=>{const name='TESTVFR'+String(i).padStart(3,'0');return [name,{name,lat:-6.2661,lon:106.7856}]}));
  const bulkFields=Object.keys(bulk400).map(name=>'navigationDirectory.vfrPoints.'+name);
  await assertSucceeds(setDoc(settings,{navigationDirectory:{vfrPoints:bulk400}},{mergeFields:bulkFields}));
  await assertFails(setDoc(doc(visitor,'publicSettings','bookingApp'),{navigationDirectory:{vfrPoints:bulk400}},{mergeFields:bulkFields}));
  const saved400=(await assertSucceeds(getDoc(doc(guest,'publicSettings','bookingApp')))).data().navigationDirectory;
  if(!saved400.vfrPoints.TESTVFR000||!saved400.vfrPoints.TESTVFR399||!saved400.vfrPoints['ABEAM PLM']||!saved400.airports.ZQA)throw Error('400-point batch did not preserve shared data');
  console.log('NAVIGATION_FIRESTORE_CHECKS passed');

  await assertSucceeds(updateDoc(doc(root,'publicSettings','bookingApp'),{'customization.companyName':'Allowed'}));
  const hold={plane:'Demo Helicopter',owner:'visitor-a',status:'pending',expires:Date.now()+300000,updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(visitor,'fleetHolds','ZZ-TEST'),hold));
  await assertFails(setDoc(doc(other,'fleetHolds','ZZ-TEST'),{...hold,owner:'visitor-b'}));
  await assertSucceeds(updateDoc(doc(visitor,'fleetHolds','ZZ-TEST'),{status:'released',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(visitor,'fleetHolds','PK-TWZ'),{...hold,plane:'AW109S Grand'}));
  await assertSucceeds(setDoc(doc(admin,'publicFleetPhotos','ZZ-TEST'),{url:'data:image/jpeg;base64,AAAA',updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(guest,'publicFleetPhotos','ZZ-TEST')));
  await assertFails(setDoc(doc(visitor,'publicFleetPhotos','ZZ-TEST'),{url:'bad'}));
  await env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),'bookingRequests','TWA-DELETE-ADMIN'),{ref:'TWA-DELETE-ADMIN',name:'Delete fixture',createdBy:'visitor-a'});
   await setDoc(doc(ctx.firestore(),'bookingRequests','TWA-DELETE-SUPER'),{ref:'TWA-DELETE-SUPER',name:'Delete fixture',createdBy:'visitor-a'});
   await setDoc(doc(ctx.firestore(),'bookingRequests','TWA-KEEP'),{ref:'TWA-KEEP',name:'Keep fixture',createdBy:'visitor-a'});
  });
  await assertFails(deleteDoc(doc(visitor,'bookingRequests','TWA-DELETE-ADMIN')));
  await assertFails(deleteDoc(doc(guest,'bookingRequests','TWA-DELETE-ADMIN')));
  await assertSucceeds(deleteDoc(doc(admin,'bookingRequests','TWA-DELETE-ADMIN')));
  await assertSucceeds(deleteDoc(doc(root,'bookingRequests','TWA-DELETE-SUPER')));
  if((await getDoc(doc(admin,'bookingRequests','TWA-DELETE-ADMIN'))).exists()||!(await getDoc(doc(admin,'bookingRequests','TWA-KEEP'))).exists())throw Error('Booking deletion affected the wrong reference');
  console.log('BOOKING_REQUEST_DELETE_RULES_CHECKS passed');

  // Exercise the actual browser bridge methods against the Firestore emulator.
  const appSource=fs.readFileSync('index.html','utf8'),bridgeStart=appSource.indexOf(' createBooking:async(item)=>{'),bridgeEnd=appSource.indexOf(' deleteBooking:async(id)=>',bridgeStart);
  if(bridgeStart<0||bridgeEnd<0)throw Error('Booking bridge methods missing');
  const bridgeCode=appSource.slice(bridgeStart,bridgeEnd);
  const bridge=(database,uid,adminFlag)=>{
   const state={TWAAdminVerified:adminFlag,TWACloudHolds:{},updateHoldUI(){},updatePaymentTimer(){}};
   return new Function('db','doc','setDoc','runTransaction','serverTimestamp','window','holdUser','holdReference','aircraft','num','departureDateError','returnDateError','return ({'+bridgeCode+'});')(
    database,doc,setDoc,runTransaction,serverTimestamp,state,async()=>({uid}),()=>doc(database,'fleetHolds','ZZ-TEST'),[['Demo Helicopter','Test helicopter','ZZ-TEST']],()=>16000,()=>'',()=>'');
  };
  const ownerAPI=bridge(visitor,'visitor-a',false),adminAPI=bridge(admin,'cIHf6R5zNST1vjwa64zxTgyladm1',true),forgedAPI=bridge(visitor,'visitor-a',true);
  const expiry=Date.now()+300000,ownedHold={plane:'Demo Helicopter',owner:'visitor-a',status:'pending',expires:expiry,updatedAt:serverTimestamp()};
  await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'fleetHolds','ZZ-TEST'),ownedHold));
  const bookingItem={ref:'TWA-WA-PAID',name:'WhatsApp fixture',email:'fixture@example.com',phone:'+628123456789',company:'Fixture',from:'HLP',to:'TKG',date:'2026-11-01',time:'09:00',pax:'4',plane:'Demo Helicopter',purpose:'Private Charter',trip:'One Way',returnDate:'',stops:'',notes:'Test request',status:'Awaiting Payment Instructions',estimate:{totalUSD:12500.5,currency:'IDR',fx:16000,hours:2,route:'HLP -> TKG',breakdown:[['Aircraft charter',12000],['Fuel',500.5]],routes:[{from:'HLP',to:'TKG',date:'2026-11-01',time:'09:00',route:'HLP -> TKG',hours:2}],holdExpires:expiry}};
  await assertSucceeds(ownerAPI.createBooking(bookingItem));
  const saved=(await getDoc(doc(admin,'bookingRequests',bookingItem.ref))).data();
  if(saved.estimate.holdExpires!==expiry||saved.estimate.holdOwner!=='visitor-a'||saved.estimate.aircraftRegistration!=='ZZ-TEST'||saved.estimate.breakdown[0].label!=='Aircraft charter')throw Error('Hold identity/quote not saved on booking');
  await assertFails(forgedAPI.confirmBookingPayment(bookingItem.ref));
  await assertFails(updateDoc(doc(visitor,'fleetHolds','ZZ-TEST'),{status:'paid',updatedAt:serverTimestamp()}));
  await assertSucceeds(adminAPI.confirmBookingPayment(bookingItem.ref));
  if((await getDoc(doc(admin,'bookingRequests',bookingItem.ref))).data().status!=='Confirmed'||(await getDoc(doc(guest,'fleetHolds','ZZ-TEST'))).data().status!=='paid')throw Error('Payment did not atomically confirm booking and hold');
  await assertSucceeds(adminAPI.confirmBookingPayment(bookingItem.ref));
  const old={...saved,status:'Awaiting Payment Instructions',ref:'TWA-WA-STALE'};
  await env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),'bookingRequests',old.ref),old);
   await setDoc(doc(ctx.firestore(),'fleetHolds','ZZ-TEST'),{...ownedHold,owner:'visitor-b',expires:expiry+1000});
  });
  await assert.rejects(()=>adminAPI.confirmBookingPayment(old.ref),/changed|another request/);
  if((await getDoc(doc(guest,'fleetHolds','ZZ-TEST'))).data().owner!=='visitor-b'||(await getDoc(doc(admin,'bookingRequests',old.ref))).data().status==='Confirmed')throw Error('Stale link confirmed another customer hold');
  await assertSucceeds(adminAPI.cancelBookingRequest(old.ref));
  if((await getDoc(doc(guest,'fleetHolds','ZZ-TEST'))).data().status!=='pending')throw Error('Cancel released a different customer hold');
  const expired={...saved,ref:'TWA-WA-EXPIRED',status:'Awaiting Payment Instructions',estimate:{...saved.estimate,holdExpires:Date.now()-1000}};
  await env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),'bookingRequests',expired.ref),expired);
   await setDoc(doc(ctx.firestore(),'fleetHolds','ZZ-TEST'),{...ownedHold,expires:expired.estimate.holdExpires});
  });
  await assert.rejects(()=>adminAPI.confirmBookingPayment(expired.ref),/expired/);
  const cancel={...saved,ref:'TWA-WA-CANCEL',status:'Awaiting Payment Instructions'};
  await env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),'bookingRequests',cancel.ref),cancel);
   await setDoc(doc(ctx.firestore(),'fleetHolds','ZZ-TEST'),ownedHold);
  });
  await assertSucceeds(adminAPI.cancelBookingRequest(cancel.ref));
  if((await getDoc(doc(guest,'fleetHolds','ZZ-TEST'))).data().status!=='released'||(await getDoc(doc(admin,'bookingRequests',cancel.ref))).data().status!=='Cancelled')throw Error('Cancel did not release the linked pending hold');
  await assertSucceeds(setDoc(settings,{communication:{adminWhatsApp:'6281215917554'}},{mergeFields:['communication']}));
  await assertFails(setDoc(doc(visitor,'publicSettings','bookingApp'),{communication:{adminWhatsApp:'628111111111'}},{mergeFields:['communication']}));
  if((await getDoc(doc(guest,'publicSettings','bookingApp'))).data().communication.adminWhatsApp!=='6281215917554')throw Error('Shared WhatsApp contact is unavailable');
  console.log('WHATSAPP_BOOKING_BRIDGE_CHECKS passed: quote capture, owner create, atomic payment, stale/expired hold rejection, cancellation and contact authorization');

  console.log('SUPER_ADMIN_RULES_CHECKS passed');
 }finally{await env.cleanup()}
})().catch(error=>{console.error(error);process.exitCode=1});
