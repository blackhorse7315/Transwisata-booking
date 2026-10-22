import json, os, subprocess, time, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

Path("work").mkdir(exist_ok=True)
server=subprocess.Popen(["python","-m","http.server","8765","--directory","_site"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch()
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
            set('mcDate2',mcTestDate);set('mcTime2','15:00');calculateEstimate();
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
            assert {"index.html","customization.js","multicity.js","app-config.js","manifest.webmanifest","sw.js","firestore.rules","assets/icon-192.png","assets/icon-512.png","assets/favicon-32.png"}.issubset(files)
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
