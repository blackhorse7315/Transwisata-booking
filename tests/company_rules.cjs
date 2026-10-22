const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,serverTimestamp}=require('firebase/firestore');
(async()=>{
 const source=fs.readFileSync('firestore.rules','utf8').replace("request.auth.uid in ['cIHf6R5zNST1vjwa64zxTgyladm1']; // COMPANY_ADMIN_UIDS","request.auth.uid in ['cIHf6R5zNST1vjwa64zxTgyladm1','normal-admin']; // COMPANY_ADMIN_UIDS");
 const env=await initializeTestEnvironment({projectId:'demo-company-builder',firestore:{rules:source,host:'127.0.0.1',port:8080}});
 try{
  const root=env.authenticatedContext('cIHf6R5zNST1vjwa64zxTgyladm1').firestore();
  const admin=env.authenticatedContext('normal-admin').firestore();
  const visitor=env.authenticatedContext('visitor-a').firestore();
  const other=env.authenticatedContext('visitor-b').firestore();
  const guest=env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'publicSettings','bookingApp'),{customization:{fleetByReg:{'ZZ-TEST':{name:'Demo Helicopter',active:true}}},costs:{}}));
  await assertSucceeds(getDoc(doc(guest,'publicSettings','bookingApp')));
  await assertFails(getDoc(doc(admin,'privateSuperAdmin','accessCheck')));
  await assertSucceeds(getDoc(doc(root,'privateSuperAdmin','accessCheck')));
  await assertFails(updateDoc(doc(admin,'publicSettings','bookingApp'),{customization:{companyName:'Forbidden'}}));
  await assertFails(updateDoc(doc(visitor,'publicSettings','bookingApp'),{customization:{companyName:'Forbidden'}}));
  await assertSucceeds(updateDoc(doc(admin,'publicSettings','bookingApp'),{costs:{fuelPrice:5}}));
  await assertSucceeds(updateDoc(doc(root,'publicSettings','bookingApp'),{'customization.companyName':'Allowed'}));
  const hold={plane:'Demo Helicopter',owner:'visitor-a',status:'pending',expires:Date.now()+300000,updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(visitor,'fleetHolds','ZZ-TEST'),hold));
  await assertFails(setDoc(doc(other,'fleetHolds','ZZ-TEST'),{...hold,owner:'visitor-b'}));
  await assertSucceeds(updateDoc(doc(visitor,'fleetHolds','ZZ-TEST'),{status:'released',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(visitor,'fleetHolds','PK-TWZ'),{...hold,plane:'AW109S Grand'}));
  await assertSucceeds(setDoc(doc(admin,'publicFleetPhotos','ZZ-TEST'),{url:'data:image/jpeg;base64,AAAA',updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(guest,'publicFleetPhotos','ZZ-TEST')));
  await assertFails(setDoc(doc(visitor,'publicFleetPhotos','ZZ-TEST'),{url:'bad'}));
  console.log('SUPER_ADMIN_RULES_CHECKS passed');
 }finally{await env.cleanup()}
})().catch(error=>{console.error(error);process.exitCode=1});
