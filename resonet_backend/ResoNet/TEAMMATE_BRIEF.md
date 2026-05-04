# DACRO — City Map Handoff for Teammate

## What you are building

The backend needs a city graph. Right now it uses Bangalore neighbourhoods (`config.py`). You are replacing it with a different city. You only need to edit **one section of one file**: the `CITY_ZONES` list and the `DEMO_EARTHQUAKE` dict inside `config.py`. Nothing else needs to change.

---

## Exact format the system expects

Each zone is a Python dict. Here is the template:

```python
{
    "id": "Zone-A",               # string — must follow this exact pattern
    "name": "Your Area Name",     # string — the real neighbourhood/ward name
    "lat": 28.6139,               # float — latitude (decimal degrees)
    "lon": 77.2090,               # float — longitude (decimal degrees)
    "population_density": 0.75,   # float — 0.0 (empty land) to 1.0 (very dense)
    "has_critical_infra": True,   # bool  — True if hospital / NDRF base / fire station
    "connected_zones": ["Zone-B", "Zone-C"],  # list of zone IDs this zone shares a road with
},
```

---

## How many of each thing you need

| Thing | Count | Notes |
|---|---|---|
| Total zones | **12** | IDs must be Zone-A through Zone-L exactly |
| Hospital zone | **1** | Must be `"id": "Zone-B"` — hardcoded in hospital agent |
| NDRF base zone | **1** | Must be `"id": "Zone-A"` — hardcoded in NDRF agent |
| Fire station zone | **1** | Must be `"id": "Zone-F"` — hardcoded in fire agent |
| Earthquake epicenter | **1** | Pick any zone, preferably Zone-D (dense, no hospital) |
| Other zones | **8** | Regular residential/commercial areas |

So in plain terms: pick 12 real neighbourhoods from your city. Label the hospital area Zone-B, the NDRF/army base area Zone-A, the main fire station area Zone-F. The rest get Zone-C through Zone-L (minus the three already assigned).

---

## What `has_critical_infra` means

Set it to `True` for:
- The zone that has the main government hospital or medical college (Zone-B)
- The zone that has the NDRF battalion / army base / disaster management office (Zone-A)
- The zone that has the main fire station (Zone-F)
- Optionally: airport, power grid substation, water treatment plant

Everything else is `False`.

---

## How to estimate `population_density`

This is a 0–1 score, not a raw number. Use this rough guide:

| Area type | Score |
|---|---|
| Dense old city / slum | 0.85 – 1.0 |
| Dense residential colony | 0.65 – 0.85 |
| Mixed residential / commercial | 0.50 – 0.65 |
| Suburbs / new housing | 0.30 – 0.50 |
| Industrial / sparse outskirts | 0.10 – 0.30 |

---

## How `connected_zones` works

This forms the road graph. Think of it like: "which zones can you drive to directly from this zone?"

Rules:
- If Zone-A lists Zone-B in its connections, you should also have Zone-B list Zone-A (bidirectional roads)
- Every zone should connect to at least 1 other zone
- Zone-L (outermost) can connect to just 1
- Most inner zones should connect to 2–3 others
- Avoid disconnected islands — the whole city should be reachable from Zone-A

**Tip:** draw the city on paper first, mark which areas share major roads, then fill in the lists.

---

## The `DEMO_EARTHQUAKE` dict

```python
DEMO_EARTHQUAKE = {
    "epicenter_lat": 28.61,     # latitude of the epicenter point (can be between zones)
    "epicenter_lon": 77.21,     # longitude
    "magnitude": 7.2,           # keep 7.2 — it's calibrated to damage most zones visibly
    "epicenter_zone": "Zone-D", # which zone ID the epicenter is in / nearest to
}
```

Pick a zone near the centre of your map as the epicenter. **Do not pick Zone-B (hospital) or Zone-A (NDRF) as the epicenter** — those need to survive to respond.

---

## Full example entry (Delhi-inspired, for reference)

```python
CITY_ZONES = [
    {
        "id": "Zone-A",
        "name": "Lodhi Road",          # NDRF base / disaster management HQ
        "lat": 28.5931,
        "lon": 77.2213,
        "population_density": 0.45,
        "has_critical_infra": True,
        "connected_zones": ["Zone-B", "Zone-C", "Zone-G"],
    },
    {
        "id": "Zone-B",
        "name": "AIIMS / Safdarjung",  # Hospital zone — always Zone-B
        "lat": 28.5672,
        "lon": 77.2100,
        "population_density": 0.80,
        "has_critical_infra": True,
        "connected_zones": ["Zone-A", "Zone-C", "Zone-H"],
    },
    # ... 10 more zones
]

DEMO_EARTHQUAKE = {
    "epicenter_lat": 28.63,
    "epicenter_lon": 77.22,
    "magnitude": 7.2,
    "epicenter_zone": "Zone-D",
}
```

---

## What happens if you get it wrong

| Mistake | What breaks |
|---|---|
| Zone IDs not Zone-A through Zone-L | System silently ignores unknown zones in agent logic |
| Hospital zone is not Zone-B | Hospital agent won't issue RFPs on earthquake |
| Zone not in any `connected_zones` | That zone is unreachable by land — all rescues go aerial |
| `has_critical_infra: True` on Zone-D (epicenter) | Power agent will try to protect the epicenter — wastes resources |
| Lat/lon outside your city | Severity calculations will be wrong — epicenter distance will be off |
| Less than 12 zones | Server starts but logs will show missing zone warnings |

---

## Checklist before handing back

- [ ] Exactly 12 zones, IDs Zone-A through Zone-L
- [ ] Zone-A has `has_critical_infra: True`
- [ ] Zone-B has `has_critical_infra: True`
- [ ] Zone-F has `has_critical_infra: True`
- [ ] Epicenter zone is Zone-D (or whichever, but update `epicenter_zone` in `DEMO_EARTHQUAKE`)
- [ ] Epicenter lat/lon matches the actual coordinates of that zone
- [ ] Every zone has at least 1 entry in `connected_zones`
- [ ] All connections are bidirectional (if A lists B, B lists A)
- [ ] Population densities vary — not all 0.7, not all 0.5
- [ ] `magnitude` stays at 7.2

---

## Where to put it

Open `config.py` in the root folder. Find the `CITY_ZONES = [` block (around line 67) and replace the whole list. Also update `DEMO_EARTHQUAKE` just below it. That's it.
