"""Create a small, sourced runway reference for the airports offered by this app."""
import ast, csv, io, json, math, re, urllib.request
from pathlib import Path
REVISION = "b529623d2a0b09a9be78d37fc7a7a5e1e16e3451"
SOURCE = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/" + REVISION + "/"
def rows(name):
    with urllib.request.urlopen(SOURCE + name, timeout=60) as response:
        raw = response.read(32 * 1024 * 1024 + 1)
    if len(raw) > 32 * 1024 * 1024:
        raise ValueError("Airport reference exceeds size limit")
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
def kilometers(a, b):
    try:
        lat1, lon1, lat2, lon2 = map(math.radians, (float(a[3]), float(a[4]), float(b["latitude_deg"]), float(b["longitude_deg"])))
        h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
        return 6371*2*math.asin(min(1, math.sqrt(h)))
    except (ValueError, TypeError):
        return math.inf
def build_runways(root):
    match = re.search(r"const airportData=(\[[\s\S]*?\]\]);", Path("index.html").read_text())
    offered = ast.literal_eval(match.group(1))
    airports, runways = rows("airports.csv"), rows("runways.csv")
    by_code, by_airport = {}, {}
    for airport in airports:
        for code in (airport.get("ident"), airport.get("gps_code"), airport.get("icao_code"), airport.get("iata_code")):
            if code:
                by_code.setdefault(code, []).append(airport)
    for runway in runways:
        by_airport.setdefault(runway["airport_ref"], []).append(runway)
    reference = {}
    for entry in offered:
        candidates = {a["id"]: a for code in entry[:2] for a in by_code.get(code, [])}
        airport = min(candidates.values(), key=lambda a: kilometers(entry,a), default=None)
        if not airport or kilometers(entry, airport) > 30:
            reference[entry[0]] = {"icao":entry[1], "status":"unknown", "runways":[]}
            continue
        usable = []
        if airport["type"] not in ("closed", "heliport", "seaplane_base"):
            for runway in by_airport.get(airport["id"], []):
                try:
                    length = float(runway.get("length_ft") or 0)*0.3048
                except ValueError:
                    continue
                if runway.get("closed") != "0" or length <= 0:
                    continue
                usable.append({"id":runway.get("le_ident","")+" / "+runway.get("he_ident",""),
                    "lengthM":round(length), "surface":runway.get("surface","")})
        reference[entry[0]] = {"icao":entry[1], "sourceIdent":airport["ident"],
            "status":"closed" if airport["type"]=="closed" else "available" if usable else "unknown",
            "runways":sorted(usable, key=lambda r:r["lengthM"], reverse=True)}
    assert reference["HLP"]["runways"][0]["lengthM"] > 1600
    assert reference["SUB"]["runways"][0]["lengthM"] > 1600
    data={"source":"OurAirports public-domain runway reference","sourceUrl":"https://github.com/davidmegginson/ourairports-data/tree/"+REVISION,
          "revision":REVISION,"sourceDate":"2026-10-16","airports":reference}
    (root/"runway-data.js").write_text("window.TWARunwayReference = "+json.dumps(data,ensure_ascii=False)+";\n",encoding="utf-8")
    print("Runway reference:",len(reference),"airports,",sum(a["status"]=="available" for a in reference.values()),"with open runway lengths.")
