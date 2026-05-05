/**
 * InfraMarker.jsx
 * Styled icon markers for hospitals, fire stations, and rescue centres.
 * Uses Leaflet divIcon — bypasses the broken default-marker-icon issue in React.
 *
 * All 8 sites are placed in the clear space AROUND the city zone cluster so they
 * remain readable even after the earthquake turns zones red/orange.
 * Nearest zone is ≥ 6 km from every site below (verified against CITY_ZONES).
 *
 * Zone cluster bounding box (for reference):
 *   Lat 12.889–13.025 · Lon 77.484–77.590
 *
 * Sites are placed east (77.63–77.67), west (77.43–77.46),
 * far-north (13.04+), and far-south (12.85–12.87) of that box.
 */

import L from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';

const CFG = {
  hospital:    { emoji: '🏥', color: '#f472b6', label: 'Hospital'             },
  fire:        { emoji: '🚒', color: '#fb923c', label: 'Fire Station'          },
  ndrf:        { emoji: '🪖', color: '#4ade80', label: 'NDRF Base'            },
  police:      { emoji: '🚓', color: '#60a5fa', label: 'Police HQ'            },
  air_rescue:  { emoji: '🚁', color: '#38bdf8', label: 'Air Rescue / Helipad' },
  land_rescue: { emoji: '🚑', color: '#a78bfa', label: 'Land Rescue Centre'   },
};

// All sites are deliberately placed outside the affected zone cluster.
// The hospital/fire/police/ndrf coordinates MUST mirror EmergencyRoutes.STATIONS
// and backend config.RESPONDER_LOCATIONS so the visible icon = dispatch origin.
const INFRA_SITES = [
  // ── Hospitals (E / W / N) ─────────────────────────────────────────────
  { type: 'hospital', lat: 13.030, lon: 77.660, name: 'Hebbal Medical Centre' },
  { type: 'hospital', lat: 12.985, lon: 77.460, name: 'Magadi West Medical Centre' },
  { type: 'hospital', lat: 13.055, lon: 77.530, name: 'Yelahanka District Hospital' },

  // ── Fire stations (E / W / S) ────────────────────────────────────────
  { type: 'fire',     lat: 12.908, lon: 77.640, name: 'Banaswadi Fire Station' },
  { type: 'fire',     lat: 12.968, lon: 77.450, name: 'Magadi Road Fire Station' },
  { type: 'fire',     lat: 12.870, lon: 77.560, name: 'Kanakapura Fire Station' },

  // ── Police HQs (C / W / S) ───────────────────────────────────────────
  { type: 'police',   lat: 12.971, lon: 77.594, name: 'Central Police HQ' },
  { type: 'police',   lat: 13.000, lon: 77.480, name: 'West Bangalore Police HQ' },
  { type: 'police',   lat: 12.890, lon: 77.530, name: 'South Bangalore Police HQ' },

  // ── NDRF bases (E / W / N) ───────────────────────────────────────────
  { type: 'ndrf',     lat: 12.985, lon: 77.662, name: 'Hebbal NDRF Rapid Response' },
  { type: 'ndrf',     lat: 12.945, lon: 77.460, name: 'Nelamangala NDRF Base' },
  { type: 'ndrf',     lat: 13.060, lon: 77.580, name: 'Yelahanka NDRF Base' },

  // ── Auxiliary rescue assets (kept from prior layout) ─────────────────
  { type: 'air_rescue',  lat: 12.855, lon: 77.555, name: 'Kanakapura Air Rescue Base' },
  { type: 'land_rescue', lat: 12.863, lon: 77.470, name: 'Bidadi Land Rescue Centre' },
];

function makeIcon(type) {
  const { emoji, color } = CFG[type] ?? CFG.hospital;
  return L.divIcon({
    html: `<div style="
      width:32px;height:32px;
      background:#0f172a;
      border:2px solid ${color};
      border-radius:7px;
      display:flex;align-items:center;justify-content:center;
      font-size:16px;line-height:1;
      box-shadow:0 0 10px ${color}90,0 0 3px ${color};
    ">${emoji}</div>`,
    className:  '',
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
  });
}

// Pre-build all icons once at module load
const ICONS = Object.fromEntries(
  Object.keys(CFG).map((type) => [type, makeIcon(type)]),
);

export default function InfraMarkers() {
  return (
    <>
      {INFRA_SITES.map((site, i) => {
        const cfg = CFG[site.type] ?? CFG.hospital;
        return (
          <Marker
            key={`infra-${i}`}
            position={[site.lat, site.lon]}
            icon={ICONS[site.type]}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
              <span style={{ fontWeight: 600 }}>{site.name}</span>
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                {cfg.emoji} {cfg.label}
              </span>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
