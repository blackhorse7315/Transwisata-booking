import json, os, subprocess, time, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

Path("work").mkdir(exist_ok=True)
server=subprocess.Popen(["python","-m","http.server","8765","--directory","_site"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get("CHROME_BIN"))
        page=browser.new_page(accept_downloads=True)
        errors=[]
        page.on("pageerror",lambda error: errors.append(str(error)))
        bootstrap={"firebase":{"apiKey":"test-key","authDomain":"demo-company-builder.firebaseapp.com","projectId":"demo-company-builder","storageBucket":"demo-company-builder.firebasestorage.app","appId":"1:123:web:abc123"},"superAdminUid":"test-super","adminUids":["test-admin"]}
        page.route("**/app-config.js*",lambda route:route.fulfill(content_type="text/javascript",body="window.TWA_BOOTSTRAP="+json.dumps(bootstrap)+";"))
        page.route("**/*googleapis.com/**",lambda route:route.abort())
        page.goto("http://127.0.0.1:8765/",wait_until="domcontentloaded")
        page.wait_for_function("typeof window.validateCompanyConfig==='function'")
        page.wait_for_timeout(2000)
        assert not errors, errors
        assert page.locator("#fleet .aircraft").count()==5
        assert page.get_by_text("Aircraft reservation holds expire after 5 minutes.",exact=True).count()==1
        page.wait_for_function("""async()=>{const link=document.querySelector('link[rel="icon"]');const img=new Image();img.src=link.href;await img.decode();return img.naturalWidth===32&&img.naturalHeight===32}""")
        print("DEFAULT_FAVICON_CHECK passed")


        result=page.evaluate("""()=>{
            const set=(id,value)=>document.getElementById(id).value=value;
            set('from','HLP');set('to','SUB');set('plane','');
            const original=window.priceForAircraft,calls=[];
            window.priceForAircraft=(name,...args)=>{calls.push(name);return original(name,...args)};
            try{
                updateRoute();
                if(calls.length||lastEstimate!==null||document.querySelectorAll('#fleet .fleet-price').length)throw Error('Unselected aircraft automatically priced');
                set('plane','Gulfstream IV-SP');updatePlaneCosts();
                if(!calls.length||calls.some(name=>name!=='Gulfstream IV-SP'))throw Error('Other aircraft priced with Gulfstream selected');
                if(document.querySelectorAll('#fleet .fleet-price').length!==1||!lastEstimate)throw Error('Selected-only estimate missing');
                calls.length=0;
                showPriceDetails(1);
                if(document.getElementById('plane').value!=='King Air 350i'||calls.some(name=>name!=='King Air 350i'))throw Error('Aircraft card did not select the requested estimate');
                if(document.querySelectorAll('#fleet .fleet-price').length!==1)throw Error('Previous aircraft price remained visible');
                if(Math.abs(lastEstimate.totalUSD-original('King Air 350i').total)>1e-6)throw Error('Estimate not switched to selected aircraft');
                closePriceDetails();calls.length=0;
                set('currency','USD');calculateEstimate();
                if(calls.some(name=>name!=='King Air 350i'))throw Error('Currency change priced unselected aircraft');
                calls.length=0;set('plane','');updatePlaneCosts();
                if(calls.length||lastEstimate!==null||document.querySelectorAll('#fleet .fleet-price').length||document.getElementById('costRows').children.length)throw Error('Cleared selection retained prices');
                set('currency','IDR');
                return {noDefaultEstimate:true,selectedOnly:true,cardSelection:true,switching:true,clearSelection:true};
            }finally{window.priceForAircraft=original;closePriceDetails()}
        }""")
        print("SELECTED_AIRCRAFT_PRICING_CHECKS",json.dumps(result))

        # Multi City uses each sector's airports and dates, then totals all movement costs.
        page.evaluate("""()=>{
            const set=(id,v)=>document.getElementById(id).value=v;
            const future=new Date();future.setUTCDate(future.getUTCDate()+10);
            window.mcTestDate=future.toISOString().slice(0,10);
            set('from','HLP');set('to','SUB');set('date',mcTestDate);set('time','09:00');
            updateRoute();
        }""")
        page.get_by_role("button",name="Multi City",exact=True).click()
        assert page.locator("#multiCityEditor .mc-card").count()==2
        assert page.locator("#multi").is_hidden()
        page.locator("#mcTo2").fill("Denpasar")
        page.locator("#mcTo2Suggestions").get_by_role("option").first.click()
        assert page.locator("#mcTo2").input_value()=="DPS"
        result=page.evaluate("""()=>{
            const set=(id,v)=>document.getElementById(id).value=v;
            set('mcDate2',mcTestDate);set('mcTime2','15:00');set('plane','');calculateEstimate();
            if(lastEstimate!==null||document.querySelectorAll('#fleet .fleet-price').length)throw Error('Multi City priced an unselected aircraft');
            set('plane','Gulfstream IV-SP');calculateEstimate();
            if(document.querySelectorAll('#fleet .fleet-price').length!==1)throw Error('Multi City shows other aircraft prices');
            if(!validateMultiCity(true))throw Error(document.getElementById('multiCityError').textContent);
            const name='Gulfstream IV-SP',p=priceForAircraft(name),a=assumptions[name];
            const nm=distanceNM(airportMatch('HLP'),airportMatch('SUB'))+distanceNM(airportMatch('SUB'),airportMatch('DPS'));
            if(Math.abs(p.nm-nm)>1e-6)throw Error('Second flight missing from distance');
            const charter=(nm/a.speed+num('positioning'))*a.rate;
            if(Math.abs(p.items[0][1]-charter)>1e-6)throw Error('Aircraft hours not summed');
            if(p.items[4][1]!==num('parkingDays')*num('parking')||p.items[6][1]!==num('crewDays')*num('crew')||p.items[7][1]!==num('otherFees'))throw Error('Trip-wide charges duplicated');
            if(JSON.parse(document.getElementById('stops').value).flights.length!==2)throw Error('Itinerary missing from booking');
            showPriceDetails(0);
            if(!document.getElementById('priceModalContent').textContent.includes('Flight 2: SUB'))throw Error('Second flight missing from modal');
            closePriceDetails();
            set('mcDate2','2020-01-01');
            if(validateMultiCity()||priceForAircraft(name)!==null)throw Error('Past/invalid itinerary priced');
            set('mcDate2',mcTestDate);set('mcFrom2','SRG');calculateEstimate();
            const gap=priceForAircraft(name);
            if(gap.positions.length!==1||gap.nm<=p.nm)throw Error('Positioning omitted');
            set('mcFrom2','SUB');calculateEstimate();
            return {flights:p.legs,sectors:p.sectors,total:p.total,positioning:gap.positions.length};
        }""")
        print("MULTI_CITY_PRICING_CHECKS",json.dumps(result))
        page.locator("#multiCityAdd").click()
        assert page.locator("#multiCityEditor .mc-card").count()==3
        assert page.locator("#mcFrom3").input_value()=="DPS"
        page.get_by_role("button",name="Remove Flight 3",exact=True).click()
        assert page.locator("#multiCityEditor .mc-card").count()==2
        page.get_by_role("button",name="Swap departure and destination for Flight 2",exact=True).click()
        assert page.locator("#mcFrom2").input_value()=="DPS"
        page.get_by_role("button",name="Swap departure and destination for Flight 2",exact=True).click()
        page.set_viewport_size({"width":390,"height":844})
        page.evaluate("document.getElementById('multiCityEditor').scrollIntoView()")
        page.screenshot(path="work/multi-city-mobile.png")
        assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth")
        result=page.evaluate("""async()=>{
            const set=(id,v)=>document.getElementById(id).value=v;
            const real=window.TWAFirebase,ready=window.TWAHoldsReady,oldOwner=window.TWACloudBookings,oldAdmin=window.TWAAdminVerified;
            let received;
            window.TWAFirebase={createBooking:async item=>{received=item}};
            window.TWAHoldsReady=true;window.TWAAdminVerified=false;
            try{
                set('name','Multi City Test');set('email','test@example.com');set('phone','+62000000000');set('plane','');
                calculateEstimate();
                if(!submitBooking())throw Error('Booking rejected');
                await Promise.resolve();
                const itinerary=JSON.parse(received.stops);
                if(received.from!=='HLP'||received.to!=='DPS'||itinerary.flights.length!==2||itinerary.flights[1].to!=='DPS')throw Error('Booking itinerary lost');
                showPage('booking');
                const routes={};for(const name of ['Bell 412EP','AW109S Grand']){
                    assumptions[name].speed=distanceNM(airportMatch('HLP'),airportMatch('SRG'))/3.2;
                    for(const codes of [['HLP','SRG'],['SRG','HLP']])routes[helicopterRouteKey(name,...codes)]={codes};
                }
                tenantStorage.setItem('twaHelicopterRoutesV1',JSON.stringify(routes));
                set('to','SRG');set('mcFrom2','SRG');set('mcTo2','HLP');set('mcTime2','16:00');
                if(priceForAircraft('AW109S Grand')!==null)throw Error('Agusta daily 6h limit bypassed');
                if(!priceForAircraft('Bell 412EP'))throw Error('Bell 7h daily allowance lost');
                const nextDate=new Date(mcTestDate+'T00:00:00Z');nextDate.setUTCDate(nextDate.getUTCDate()+1);set('mcDate2',nextDate.toISOString().slice(0,10));
                if(!priceForAircraft('AW109S Grand'))throw Error('Separate dates incorrectly combined');
                return {savedFlights:itinerary.flights.length,dailyLimits:true};
            }finally{window.TWAFirebase=real;window.TWAHoldsReady=ready;window.TWAAdminVerified=oldAdmin;window.TWACloudBookings=oldOwner}
        }""")
        print("MULTI_CITY_BOOKING_AND_HELICOPTER_CHECKS",json.dumps(result))
        page.get_by_role("button",name="One Way",exact=True).click()
        assert page.locator("#booking > .grid #from").count()==1
        assert page.locator("#multiCityEditor").is_hidden()
        page.get_by_role("button",name="Multi City",exact=True).click()
        assert page.locator("#multiCityFlights #from").count()==1
        page.get_by_role("button",name="Round Trip",exact=True).click()
        assert page.locator("#returnBox").is_visible()
        page.get_by_role("button",name="One Way",exact=True).click()
        page.set_viewport_size({"width":1280,"height":900})
        assert not errors, errors


        result=page.evaluate("""async()=>{
            const set=(id,v)=>document.getElementById(id).value=v;
            const snapshot=JSON.parse(JSON.stringify(TWARunwayReference.airports));
            const values=Object.fromEntries(['from','to','plane'].map(id=>[id,document.getElementById(id).value]));
            const originalFirebase=window.TWAFirebase;
            const opened=(lengths)=>({status:'available',runways:lengths.map(lengthM=>({lengthM,id:'TEST',surface:'TEST FIXTURE'}))});
            let reserved=false;
            try{
                if(!TWARunwayReference.revision||!TWARunwayReference.sourceDate||snapshot.HLP.runways[0].lengthM<1600)throw Error('Sourced runway reference missing');
                TWARunwayReference.airports.HLP=opened([3000]);
                set('from','WIHH');set('to','WARR');
                for(const [name,min] of [['Gulfstream IV-SP',1600],['King Air 350i',1000],['CASA 212-200',800]]){
                    TWARunwayReference.airports.SUB=opened([min-1]);
                    const rejected=checkRunwayCompatibility(name);
                    if(rejected.eligible||rejected.issues[0].kind!=='short'||rejected.issues[0].minimumM!==min||priceForAircraft(name)!==null)throw Error('Below-minimum runway accepted: '+name);
                    TWARunwayReference.airports.SUB=opened([min]);
                    if(!checkRunwayCompatibility(name).eligible||!priceForAircraft(name))throw Error('Exact minimum rejected: '+name);
                }
                TWARunwayReference.airports.SUB=opened([700,1600]);
                if(!checkRunwayCompatibility('Gulfstream IV-SP').eligible)throw Error('Longest open runway not considered');
                TWARunwayReference.airports.HLP=opened([1599]);TWARunwayReference.airports.SUB=opened([3000]);
                if(checkRunwayCompatibility('Gulfstream IV-SP').eligible)throw Error('Departure airport not checked');
                TWARunwayReference.airports.HLP=opened([3000]);TWARunwayReference.airports.SUB=opened([1599]);
                set('plane','Gulfstream IV-SP');calculateEstimate();
                showPriceDetails(0);
                if(!document.getElementById('modalBookButton').hidden||!document.getElementById('priceModalContent').textContent.includes('1,599 m')||!document.getElementById('priceModalContent').textContent.includes('1,600 m'))throw Error('Professional restriction notice missing');
                window.TWAFirebase={reserveAircraft:async()=>{reserved=true}};
                if(await holdAircraft('Gulfstream IV-SP')!==false||reserved)throw Error('Restricted aircraft reserved');
                set('name','Runway Fixture');set('email','fixture@example.com');set('phone','+62000000000');
                if(submitBooking()!==false)throw Error('Restricted aircraft booking submitted');
                next();
                if(!document.getElementById('contact').classList.contains('hidden')||lastEstimate!==null)throw Error('Restricted aircraft continued');
                closePriceDetails();
                TWARunwayReference.airports.SUB={status:'closed',runways:[{lengthM:3000}]};
                if(checkRunwayCompatibility('King Air 350i').eligible)throw Error('Closed airport accepted');
                delete TWARunwayReference.airports.SUB;
                const unknown=checkRunwayCompatibility('King Air 350i');
                if(unknown.eligible||unknown.issues[0].kind!=='unknown'||unknown.issues[0].message.includes('below'))throw Error('Missing data misrepresented');
                for(const name of ['Bell 412EP','AW109S Grand'])if(!checkRunwayCompatibility(name).eligible||checkRunwayCompatibility(name).applicable)throw Error('Helicopter incorrectly restricted');
                set('plane','');set('from','HLP');set('to','SUB');
                TWARunwayReference.airports.SUB=opened([3000]);TWARunwayReference.airports.DPS=opened([1599]);
                trip('Multi City',Array.from(document.querySelectorAll('.tabs button')).find(b=>b.textContent==='Multi City'));
                set('mcFrom2','SUB');set('mcTo2','DPS');
                if(checkRunwayCompatibility('Gulfstream IV-SP').eligible||priceForAircraft('Gulfstream IV-SP')!==null)throw Error('Later Multi City airport skipped');
                TWARunwayReference.airports.DPS=opened([3000]);TWARunwayReference.airports.BPN=opened([999]);set('mcFrom2','BPN');
                if(checkRunwayCompatibility('King Air 350i').eligible)throw Error('Positioning airport skipped');
                return {thresholds:[1600,1000,800],departure:true,multiCity:true,positioning:true,unknown:true,helicoptersExempt:true,bookingBlocked:true};
            }finally{
                window.TWAFirebase=originalFirebase;TWARunwayReference.airports=snapshot;
                trip('One Way',Array.from(document.querySelectorAll('.tabs button')).find(b=>b.textContent==='One Way'));
                for(const [id,value] of Object.entries(values))set(id,value);
                closePriceDetails();updateRoute();
            }
        }""")
        print("RUNWAY_SCREENING_CHECKS",json.dumps(result))
        assert not errors, errors

        page.evaluate("showPage('superAdmin')")
        assert page.locator("#saGate").is_visible()
        assert not page.locator("#saWorkspace").is_visible()
        result=page.evaluate("""()=>{
            const cfg=getCurrentCompanyConfig();
            const canvas=document.createElement('canvas');canvas.width=canvas.height=64;canvas.getContext('2d').fillRect(0,0,64,64);cfg.iconData=canvas.toDataURL('image/jpeg');
            cfg.companyName='Demo Air';cfg.appName='Demo Air Charter';cfg.heroTitle='Company-configured heading';cfg.primary='#234567';
            cfg.fleet.push({name:'Demo Helicopter',registration:'ZZ-TEST',description:'Configured aircraft',type:'helicopter',planningSpeed:100,rateUSD:123,burnLiters:45,cruiseSpeed:105,endurance:2,seats:4,range:200,dailyHours:4,maxLegMinutes:90,active:true});
            const valid=validateCompanyConfig(cfg);
            applyCompanyCustomization(valid,{preview:true});
            const checks={brand:document.getElementById('appCompanyName').textContent==='Demo Air',title:document.title==='Demo Air Charter',newAircraft:aircraft.length===6,helicopter:isHelicopter('Demo Helicopter'),legLimit:helicopterMaxLegHours('Demo Helicopter')===1.5,rate:assumptions['Demo Helicopter'].rate===123};
            let duplicateBlocked=false;try{validateCompanyConfig({...cfg,fleet:[...cfg.fleet,cfg.fleet[0]]})}catch{duplicateBlocked=true}
            checks.duplicateBlocked=duplicateBlocked;
            let injectionBlocked=false;try{validateCompanyConfig({...cfg,fleet:[{...cfg.fleet[0],name:'<img src=x>'}]})}catch{injectionBlocked=true}
            checks.injectionBlocked=injectionBlocked;
            if(Object.values(checks).some(v=>!v))throw Error(JSON.stringify(checks));
            applyCompanyCustomization(valid);
            window.TWASuperAdminVerified=true;syncSuperAdminView();
            return checks;
        }""")
        print("COMPANY_EDITOR_CHECKS",json.dumps(result))
        page.wait_for_function("""async()=>{const link=document.querySelector('link[rel="manifest"]');if(!link.href.includes('company='))return false;const response=await fetch(link.href);const manifest=await response.json();return manifest.name==='Demo Air Charter'&&manifest.icons.length===3&&manifest.icons.every(i=>i.src.startsWith('data:image/png;base64,'))}""",timeout=30000)
        print("PWA_MANIFEST_CHECKS passed")
        page.wait_for_function("""async()=>{const link=document.querySelector('link[rel="icon"]');if(!link.href.startsWith('data:image/png;base64,'))return false;const img=new Image();img.src=link.href;await img.decode();return img.naturalWidth===32&&img.naturalHeight===32}""")
        print("CUSTOM_JPEG_TO_PNG_FAVICON_CHECK passed")
        with page.expect_download(timeout=90000) as download_info:
            page.evaluate("exportCompanyApp()")
        downloaded=download_info.value
        downloaded.save_as("work/company-app.zip")
        with zipfile.ZipFile("work/company-app.zip") as package:
            files=set(package.namelist())
            assert {"index.html","customization.js","multicity.js","runway-data.js","runways.js","app-config.js","manifest.webmanifest","sw.js","firestore.rules","assets/icon-192.png","assets/icon-512.png","assets/favicon-32.png"}.issubset(files)
            manifest=json.loads(package.read("manifest.webmanifest"))
            assert manifest["name"]=="Demo Air Charter"
            config=package.read("app-config.js").decode()
            rules=package.read("firestore.rules").decode()
            assert "demo-company-builder" in config
            assert "test-super" in rules and "test-admin" in rules
            assert not any("bookingRequests" in name for name in files)
        assert not errors, errors
        print("PACKAGE_EXPORT_CHECKS passed")
        page.screenshot(path="work/company-builder.png",full_page=False)
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
