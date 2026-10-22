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
            assert {"index.html","customization.js","app-config.js","manifest.webmanifest","sw.js","firestore.rules","assets/icon-192.png","assets/icon-512.png","assets/favicon-32.png"}.issubset(files)
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
