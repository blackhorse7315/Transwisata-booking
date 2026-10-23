import json, os, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright

server=subprocess.Popen(["python","-m","http.server","8766","--directory","_site"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get("CHROME_BIN"))
        context=browser.new_context()
        page=context.new_page()
        errors=[]
        def configure(target):
            target.on("pageerror",lambda error:errors.append(str(error)))
            bootstrap={"firebase":{"apiKey":"test-key","authDomain":"demo-navigation.firebaseapp.com","projectId":"demo-navigation","appId":"1:123:web:nav-test"},"superAdminUid":"test-super","adminUids":["test-admin"]}
            target.route("**/app-config.js*",lambda route:route.fulfill(content_type="text/javascript",body="window.TWA_BOOTSTRAP="+json.dumps(bootstrap)+";"))
            target.route("**/*googleapis.com/**",lambda route:route.abort())
            target.goto("http://127.0.0.1:8766/",wait_until="domcontentloaded")
            target.wait_for_function("typeof window.saveNavigationForm==='function'")
        configure(page)
        result=page.evaluate("""async()=>{
            const set=(id,value)=>document.getElementById(id).value=value;
            const point=(name,lat,lon)=>({name,lat,lon});
            window.testPublicSettings={navigationDirectory:{airports:{},vfrPoints:{}},helicopterRoutes:{}};
            window.testWrites=[];
            window.TWAFirebase={
                saveNavigationRecord:async(kind,code,value)=>{testWrites.push([kind,code,value]);testPublicSettings.navigationDirectory[kind][code]=value},
                saveConfig:async(key,value)=>{testPublicSettings[key]=value},
                saveVFRPoints:async records=>{testWrites.push(['bulk',records]);for(const r of records)testPublicSettings.navigationDirectory.vfrPoints[r.name]=r}
            };
            set('navAirportName','Fixture Airport');set('navAirportCity','Fixture City');set('navAirportIata','ZQA');set('navAirportIcao','WAQA');set('navAirportRunway','1200');
            set('navAirportLat','06° 30′ 00″ S');set('navAirportLon','106° 45′ 00″ E');
            window.TWAAdminVerified=false;
            if(await saveNavigationForm('airports')||testWrites.length)throw Error('Unauthorized directory write');
            window.TWAAdminVerified=true;syncAdminView();showPage('admin');
            if(!await saveNavigationForm('airports'))throw Error(document.getElementById('navAirportStatus').textContent);
            const a=airportMatch('ZQA');
            if(!a||airportMatch('WAQA')!==a||!a[2].includes('Fixture City')||Math.abs(a[3]+6.5)>1e-8||Math.abs(a[4]-106.75)>1e-8)throw Error('Manual airport not connected to search/coordinates');
            if(checkRunwayCompatibility('Gulfstream IV-SP',{from:'HLP',to:'ZQA'}).eligible||!checkRunwayCompatibility('King Air 350i',{from:'HLP',to:'ZQA'}).eligible)throw Error('Manual runway not connected to screening');
            for(const [value,axis] of [['91 00 00 N','lat'],['06 60 00 S','lat'],['180 00 01 E','lon'],['06 10 10 E','lat'],['06 10 60 S','lat']]){
                let failed=false;try{navDmsToDecimal(value,axis)}catch{failed=true}if(!failed)throw Error('Invalid DMS accepted: '+value);
            }
            if(Math.abs(navDmsToDecimal(navDecimalToDms(-6.2666,'lat'),'lat')+6.2666)>1e-6||navDmsToDecimal('N 00° 00′ 00″','lat')!==0||navDmsToDecimal('180 00 00 W','lon')!==-180)throw Error('DMS conversion boundary failure');
            const fixtures=[point('PIMOL',-6.2,106.6),point('GOLPI',-6.1,106.3),point('ERANG',-6.0,106.0),point('MERAK',-5.9,105.7),point('GUSAN',-5.6,105.4)];
            for(const r of fixtures){
                set('navVfrName',r.name);set('navVfrLat',navDecimalToDms(r.lat,'lat'));set('navVfrLon',navDecimalToDms(r.lon,'lon'));
                if(!await saveNavigationForm('vfrPoints'))throw Error(document.getElementById('navVfrStatus').textContent);
                if(!isVFRPoint(routePointMatch(r.name))||airportMatch(r.name))throw Error('VFR point is being treated as an airport');
            }
            set('navVfrName','HLP');set('navVfrLat','06 00 00 S');set('navVfrLon','106 00 00 E');
            const writes=testWrites.length;
            if(await saveNavigationForm('vfrPoints')||testWrites.length!==writes)throw Error('Airport/VFR identifier collision accepted');
            document.querySelector('#navAirportTable [data-edit]').click();set('navAirportRunway','1700');
            if(!await saveNavigationForm('airports')||!checkRunwayCompatibility('Gulfstream IV-SP',{from:'HLP',to:'ZQA'}).eligible)throw Error('Airport edit did not update runway screening');
            return {airportSearch:true,dms:true,manualRunway:true,vfrPoints:fixtures.length,adminOnly:true};
        }""")
        print("NAVIGATION_DIRECTORY_CHECKS",json.dumps(result))
        page.locator("#heliRouteSequence").fill("HLP-PIM")
        page.locator("#heliRoutePointSuggestions").get_by_role("option").first.click()
        assert page.locator("#heliRouteSequence").input_value()=="HLP-PIMOL-"
        result=page.evaluate("""async()=>{
            const set=(id,value)=>document.getElementById(id).value=value;
            const codes=['HLP','PIMOL','GOLPI','ERANG','MERAK','GUSAN','TKG'];
            set('heliRouteFrom','HLP');set('heliRouteTo','TKG');set('heliRouteAircraft','both');set('heliRouteSequence',codes.join('-'));
            document.getElementById('heliRouteReverse').checked=true;await saveHelicopterRoute();
            if(Object.values(getHelicopterRoutes()).filter(Boolean).length!==4)throw Error('Helicopter/reverse routes not persisted');
            const originalRoutes=JSON.parse(JSON.stringify(getHelicopterRoutes())),editKey=helicopterRouteKey('Bell 412EP','HLP','TKG'),returnKey=helicopterRouteKey('Bell 412EP','TKG','HLP'),otherKey=helicopterRouteKey('AW109S Grand','HLP','TKG');
            const saveFunction=window.TWAFirebase.saveConfig;let editWrites=0;
            const countedSave=async(key,value)=>{editWrites++;return saveFunction(key,value)};
            window.TWAFirebase.saveConfig=countedSave;
            try{
                document.getElementById('editHeliRoute0').click();
                if(document.getElementById('heliRouteAircraft').value!=='Bell 412EP'||document.getElementById('heliRouteFrom').value!=='HLP'||document.getElementById('heliRouteTo').value!=='TKG'||document.getElementById('heliRouteSequence').value!==codes.join('-')||document.getElementById('cancelHeliRouteEdit').hidden||document.getElementById('heliRouteReverse').checked)throw Error('Edit row did not load the helicopter and VFR route');
                set('heliRouteSequence','HLP-PIMOL-TKG');document.getElementById('cancelHeliRouteEdit').click();
                if(editWrites||JSON.stringify(getHelicopterRoutes())!==JSON.stringify(originalRoutes)||!document.getElementById('cancelHeliRouteEdit').hidden)throw Error('Cancel Edit changed stored routes');
                document.getElementById('editHeliRoute0').click();
                const edited=['HLP','PIMOL','ERANG','MERAK','GUSAN','TKG'];set('heliRouteSequence',edited.join('-'));
                if(!await saveHelicopterRoute())throw Error(document.getElementById('heliRouteStatus').textContent);
                if(getHelicopterRoutes()[editKey].codes.join('-')!==edited.join('-')||getHelicopterRoutes()[returnKey].codes.join('-')!==codes.slice().reverse().join('-')||JSON.stringify(getHelicopterRoutes()[otherKey])!==JSON.stringify(originalRoutes[otherKey])||!document.getElementById('cancelHeliRouteEdit').hidden)throw Error('Single-route edit changed unrelated routes or kept edit mode');
                editHelicopterRoute(editKey);document.getElementById('heliRouteReverse').checked=true;set('heliRouteSequence','HLP-PIMOL-GOLPI-TKG');
                if(!await saveHelicopterRoute()||getHelicopterRoutes()[returnKey].codes.join('-')!=='TKG-GOLPI-PIMOL-HLP')throw Error('Explicit reverse edit not applied');
                editHelicopterRoute(editKey);set('heliRouteTo','ZQA');set('heliRouteSequence','HLP-PIMOL-ZQA');
                if(!await saveHelicopterRoute())throw Error(document.getElementById('heliRouteStatus').textContent);
                const movedKey=helicopterRouteKey('Bell 412EP','HLP','ZQA');
                if(getHelicopterRoutes()[editKey]!==null||!getHelicopterRoutes()[movedKey])throw Error('Changed endpoints left the previous active route');
                editHelicopterRoute(movedKey);set('heliRouteAircraft','AW109S Grand');
                if(!await saveHelicopterRoute()||getHelicopterRoutes()[movedKey]!==null||!getHelicopterRoutes()[helicopterRouteKey('AW109S Grand','HLP','ZQA')])throw Error('Changed helicopter left the previous active route');
                const currentKey=helicopterRouteKey('AW109S Grand','HLP','ZQA');editHelicopterRoute(currentKey);
                const beforeFailure=JSON.stringify(getHelicopterRoutes());
                window.TWAFirebase.saveConfig=async()=>{throw Error('Simulated save failure')};
                if(await saveHelicopterRoute()||JSON.stringify(getHelicopterRoutes())!==beforeFailure||document.getElementById('cancelHeliRouteEdit').hidden)throw Error('Failed save discarded edit mode or changed cache');
            }finally{
                window.TWAFirebase.saveConfig=saveFunction;
                await saveFunction('helicopterRoutes',originalRoutes);
                tenantStorage.setItem('twaHelicopterRoutesV1',JSON.stringify(originalRoutes));
                cancelHelicopterRouteEdit(false);drawHelicopterRoutesAdmin();
                set('heliRouteFrom','HLP');set('heliRouteTo','TKG');set('heliRouteAircraft','both');set('heliRouteSequence',codes.join('-'));document.getElementById('heliRouteReverse').checked=true;
            }
            console.log('HELICOPTER_ROUTE_EDIT_CHECKS passed');
            const name='Bell 412EP',plan=selectedRoutePlan(airportMatch('HLP'),airportMatch('TKG'),name);
            if(!plan.ok||plan.points.length!==7||plan.legs.length!==1||plan.legs[0].via.length!==5)throw Error('VFR navigation legs incorrectly create landing sectors');
            const expected=codes.slice(1).reduce((sum,code,i)=>sum+distanceBetween(routePointMatch(codes[i]),routePointMatch(code)),0);
            if(Math.abs(plan.totalNM-expected)>1e-6)throw Error('VFR distances not included');
            set('from','HLP');set('to','TKG');set('plane',name);
            const future=new Date();future.setUTCDate(future.getUTCDate()+10);set('date',future.toISOString().slice(0,10));set('time','09:00');
            handlingRates={HLP:111,TKG:222};
            const originalFuel=window.airportFuelUSDPerGallon;
            window.airportFuelUSDPerGallon=(airport)=>{if(isVFRPoint(airport))throw Error('VFR point billed as fuel airport');return airport[0]==='HLP'?10:20};
            try{
                updateRoute();const quote=priceForAircraft(name);
                if(quote.sectors!==1||quote.items[2][1]!==333||quote.items[3][1]!==num('landing'))throw Error('VFR points charged landing/handling');
                const expectedFuel=plan.totalHours*assumptions[name].burn*10+num('positioning')*assumptions[name].burn*num('fuelPrice');
                if(Math.abs(quote.items[1][1]-expectedFuel)>1e-6)throw Error('Fuel not priced from actual departure airport over VFR route');
                showPriceDetails(aircraft.findIndex(a=>a[0]===name));
                if(!document.getElementById('realRouteMap').textContent.includes('PIMOL')||!document.getElementById('smartRouteDetails').textContent.includes('GUSAN'))throw Error('VFR map/detail labels missing');
                const map=document.querySelector('#realRouteMap .route-zoom-map'),svg=map.querySelector('svg'),initial=svg.getAttribute('viewBox');
                const marker=svg.querySelector('.route-map-marker'),circle=marker.querySelector('circle'),label=marker.querySelector('text'),circleWidth=circle.getBoundingClientRect().width,labelWidth=label.getBoundingClientRect().width;
                routeMapZoom(svg,5);
                if(Math.abs(circle.getBoundingClientRect().width-circleWidth)>.1||Math.abs(label.getBoundingClientRect().width-labelWidth)>.1)throw Error('Map markers or labels grew at 500% zoom');
                routeMapReset(svg);
                map.querySelector('[aria-label="Zoom in route map"]').click();
                if(svg.dataset.zoom!=='1.5'||svg.viewBox.baseVal.width>=Number(initial.split(' ')[2]))throw Error('Map zoom in failed');
                map.querySelector('[aria-label="Zoom out route map"]').click();
                if(svg.dataset.zoom!=='1')throw Error('Map zoom out failed');
                routeMapZoom(svg,100);if(svg.dataset.zoom!=='16')throw Error('Map upper zoom limit failed');
                routeMapZoom(svg,.0001);if(svg.dataset.zoom!=='0.5')throw Error('Map lower zoom limit failed');
                routeMapReset(svg);if(svg.getAttribute('viewBox')!==initial)throw Error('Map reset failed');
                svg.dispatchEvent(new KeyboardEvent('keydown',{key:'+',bubbles:true}));if(svg.dataset.zoom!=='1.5')throw Error('Map keyboard zoom failed');
                closePriceDetails();
                trip('Round Trip',Array.from(document.querySelectorAll('.tabs button')).find(b=>b.textContent==='Round Trip'));
                set('returnDate',document.getElementById('date').value);calculateEstimate();
                const back=priceForAircraft(name),roundFuel=plan.totalHours*assumptions[name].burn*30+num('positioning')*assumptions[name].burn*num('fuelPrice');
                if(back.sectors!==2||back.items[2][1]!==666||Math.abs(back.items[1][1]-roundFuel)>1e-6)throw Error('Reverse VFR route billing incorrect');
                trip('One Way',Array.from(document.querySelectorAll('.tabs button')).find(b=>b.textContent==='One Way'));
                set('heliRouteAircraft',name);set('heliRouteSequence','HLP-PIMOL-ZQA-GOLPI-TKG');document.getElementById('heliRouteReverse').checked=false;await saveHelicopterRoute();
                const refuel=priceForAircraft(name);
                if(refuel.sectors!==2||refuel.items[2][1]!==111+airportRate('ZQA')+222||refuel.items[3][1]!==2*num('landing'))throw Error('Actual refuel airport not charged');
                let unknown=false;try{normalizeHelicopterRoute('HLP','TKG','HLP-UNKNOWN-TKG')}catch{unknown=true}if(!unknown)throw Error('Unknown VFR point silently accepted');
                const confirmBefore=window.confirm;window.confirm=()=>false;try{if(await removeNavigationRecord('vfrPoints','PIMOL')||!routePointMatch('PIMOL'))throw Error('Cancelled VFR deletion changed data')}finally{window.confirm=confirmBefore}
                set('from','HLP');set('to','TKG');
                return {map:true,viaDistance:plan.totalNM,landingSectors:quote.sectors,reverse:true,refuelAirport:true,cancelledDeletePreserved:true};
            }finally{window.airportFuelUSDPerGallon=originalFuel}
        }""")
        print("VFR_ROUTE_PRICING_CHECKS",json.dumps(result))
        shared=page.evaluate("testPublicSettings")
        other_context=browser.new_context()
        other=other_context.new_page()
        configure(other)
        other.evaluate("data=>applyNavigationDirectory(data.navigationDirectory)",shared)
        assert other.evaluate("!!airportMatch('ZQA')&&isVFRPoint(routePointMatch('PIMOL'))")
        other.evaluate("""data=>{
            tenantStorage.setItem('twaHelicopterRoutesV1',JSON.stringify(data.helicopterRoutes));
            const plan=selectedRoutePlan(airportMatch('HLP'),airportMatch('TKG'),'Bell 412EP');
            if(!plan.ok||plan.points.length!==5||plan.legs.length!==2)throw Error('Other device did not resolve shared airport/VFR route');
        }""",shared)
        print("OTHER_DEVICE_NAVIGATION_CHECK passed")

        bulk_text="""PIMAL S06 15'58" E106 47'08"
GUSAN S05 46'00" E105 47'05"
ERANG S06 06'54" E106 09'14"
SOBAR S06 13'07" E106 28'25"
BUDIT S06 17'32" E106 33'57"
GOLFI S06 16'43" E106 38'59" """
        page.evaluate("showPage('admin')")
        page.locator("#navVfrBulkInput").fill(bulk_text)
        assert page.locator("#navVfrBulkPreview tbody tr").count()==6
        result=page.evaluate("""async text=>{
            const before=testWrites.length;
            const good=parseVFRBulkInput(text);
            if(good.length!==6||good[0].name!=='PIMAL'||Math.abs(good[0].lat-(-6-15/60-58/3600))>1e-9||Math.abs(good[0].lon-(106+47/60+8/3600))>1e-9)throw Error('Bulk DMS parsing incorrect');
            window.TWAAdminVerified=false;if(await importVFRBulkInput()||testWrites.length!==before)throw Error('Unauthorized bulk import');
            window.TWAAdminVerified=true;
            for(const bad of [text+'\\n'+text.split('\\n')[0],'BAD S06 60\\'00" E106 00\\'00"','HLP S06 00\\'00" E106 00\\'00"','BAD S91 00\\'00" E106 00\\'00"']){
                document.getElementById('navVfrBulkInput').value=bad;
                if(await importVFRBulkInput()||testWrites.length!==before)throw Error('Invalid bulk import wrote partial data');
            }
            document.getElementById('navVfrBulkInput').value=text;
            const save=TWAFirebase.saveVFRPoints;TWAFirebase.saveVFRPoints=async()=>{throw Error('Simulated import failure')};
            if(await importVFRBulkInput()||routePointMatch('PIMAL'))throw Error('Failed import changed local directory');
            TWAFirebase.saveVFRPoints=save;
            if(!await importVFRBulkInput()||testWrites.length!==before+1)throw Error('Bulk save failed or did not use one write');
            if(!routePointMatch('PIMAL')||!routePointMatch('PIMOL')||!airportMatch('ZQA')||Math.abs(routePointMatch('GUSAN')[3]-good[1].lat)>1e-9||Object.keys(getNavigationDirectory().vfrPoints).length!==9)throw Error('Bulk import did not preserve directory or update coordinates');
            return {points:6,atomicSave:true,existingUpdated:true,invalidRejected:true};
        }""",bulk_text)
        print("VFR_BULK_IMPORT_CHECKS",json.dumps(result))

        extended_text="""ABEAM PLM S03 01'21" E104 13'20" VFR
TERKA S04 14'02" E104 57'37" VFR
ABEAM TERKA S04 17'36" E104 46'11" VFR
WAY KAMBAS S05 07'24" E105 44'29" VFR
ABEAM JAMBI S01 41'25" E103 34'42" VFR
ABEAM JAPURA S00 23'26" E102 17'25" VFR
SCC S06 33'32" E106 50'53" VFR
SENTUL OPEN AREA S06 33'41" E106 51'00" VFR"""
        page.locator("#navVfrBulkInput").fill(extended_text)
        assert page.locator("#navVfrBulkPreview tbody tr").count()==8
        page.locator("#navVfrBulkSave").click()
        page.wait_for_function("!!routePointMatch('SENTUL OPEN AREA')")
        assert page.evaluate("Math.abs(routePointMatch('ABEAM PLM')[3]-(-3-1/60-21/3600))<1e-9")
        result=page.evaluate("""()=>{
            const points=normalizeHelicopterRoute('HLP','TKG','HLP-ABEAM PLM-WAY KAMBAS-TKG');
            if(points.length!==4||points[1][0]!=='ABEAM PLM'||points[2][0]!=='WAY KAMBAS')throw Error('Multiword VFR route failed');
            if(normalizeHelicopterRoute('HLP','TKG','HLP PIMOL TKG').length!==3)throw Error('Legacy space-separated route broken');
            return {multiword:true,trailingVFR:true,points:8};
        }""")
        print("VFR_USER_FORMAT_CHECKS",json.dumps(result))

        other.evaluate("data=>applyNavigationDirectory(data.navigationDirectory)",page.evaluate("testPublicSettings"))
        assert other.evaluate("!!routePointMatch('PIMAL')&&!!routePointMatch('GOLFI')&&!!airportMatch('ZQA')")
        page.evaluate("showPage('booking');showPriceDetails(aircraft.findIndex(a=>a[0]==='Bell 412EP'))")
        svg=page.locator("#realRouteMap .route-zoom-svg")
        box=svg.bounding_box()
        before=svg.get_attribute("viewBox")
        page.mouse.move(box["x"]+box["width"]/2,box["y"]+box["height"]/2)
        page.mouse.down()
        page.mouse.move(box["x"]+box["width"]/2+30,box["y"]+box["height"]/2+20,steps=4)
        page.mouse.up()
        assert svg.get_attribute("viewBox")!=before
        page.evaluate("closePriceDetails()")
        print("ROUTE_MAP_ZOOM_PAN_CHECKS passed")

        result=page.evaluate("""async()=>{
            const confirmBefore=window.confirm,saveBefore=TWAFirebase.saveNavigationRecord;
            let warning='';
            window.confirm=message=>{warning=message;return true};
            const before=JSON.stringify(getNavigationDirectory());
            try{
                TWAFirebase.saveNavigationRecord=async()=>{throw Error('Simulated delete failure')};
                if(await removeNavigationRecord('vfrPoints','PIMOL')||JSON.stringify(getNavigationDirectory())!==before)throw Error('Failed deletion changed data');
                TWAFirebase.saveNavigationRecord=saveBefore;
                const row=Array.from(document.querySelectorAll('#navVfrTable tbody tr')).find(r=>r.cells[0].textContent==='PIMOL');
                row.querySelector('[data-delete]').click();
                await new Promise(resolve=>setTimeout(resolve,30));
                if(routePointMatch('PIMOL')||!warning.includes('saved route'))throw Error('Referenced VFR Delete button failed');
                const plan=selectedRoutePlan(airportMatch('HLP'),airportMatch('TKG'),'Bell 412EP');
                if(plan.ok||!plan.reason.includes('unknown'))throw Error('Deleted point caused silent route substitution');
                return {deleteButton:true,failedSavePreserved:true,referencedRouteRequiresEdit:true};
            }finally{window.confirm=confirmBefore;TWAFirebase.saveNavigationRecord=saveBefore}
        }""")
        print("VFR_REFERENCED_DELETE_CHECKS",json.dumps(result))
        other.evaluate("data=>applyNavigationDirectory(data.navigationDirectory)",page.evaluate("testPublicSettings"))
        assert other.evaluate("!routePointMatch('PIMOL')&&!!routePointMatch('ABEAM PLM')")


        result=page.evaluate("""async()=>{
            const original=window.confirm;window.confirm=()=>true;
            try{
                tenantStorage.setItem('twaHelicopterRoutesV1','{}');
                if(!await removeNavigationRecord('airports','ZQA')||airportMatch('ZQA')||TWARunwayReference.airports.ZQA)throw Error('Manual airport removal did not clear directory/runway override');
                if(!await removeNavigationRecord('vfrPoints','SOBAR')||routePointMatch('SOBAR'))throw Error('VFR removal did not clear route lookup');
                return {airportRemoved:true,vfrRemoved:true};
            }finally{window.confirm=original}
        }""")
        print("NAVIGATION_REMOVAL_CHECKS",json.dumps(result))
        other.evaluate("data=>applyNavigationDirectory(data.navigationDirectory)",page.evaluate("testPublicSettings"))
        assert other.evaluate("!airportMatch('ZQA')&&!routePointMatch('PIMOL')")
        assert not errors, errors
        page.evaluate("showPage('admin');document.getElementById('navigationDataAdmin').scrollIntoView()")
        Path("work").mkdir(exist_ok=True)
        page.screenshot(path="work/navigation-admin.png")
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
