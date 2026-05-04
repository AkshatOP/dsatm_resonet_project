/**
 * CityMap.jsx
 * Main Leaflet map wrapper.
 * Render order (bottom → top):
 *   1. Earthquake halo  — large dashed circle at epicenter
 *   2. Building clusters — density dots per zone
 *   3. Zone circles     — interactive zone markers (subtly highlighted on legend hover)
 *   4. Infra markers    — hospital / fire / rescue icons
 *   5. MapLegend        — interactive zone legend with hover highlight
 */

import { useState }              from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ZoneCircle      from './ZoneCircle';
import BuildingCluster from './BuildingCluster';
import InfraMarkers    from './InfraMarker';
import EarthquakeHalo  from './EarthquakeHalo';
import MapLegend       from './MapLegend';

const CARTO_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const CENTER = [12.9716, 77.5946];
const ZOOM   = 13;

export default function CityMap({ zones, epicenter }) {
  const [hoveredZoneId, setHoveredZoneId] = useState(null);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={CENTER}
        zoom={ZOOM}
        zoomControl={true}
        style={{ width: '100%', height: '100%' }}
        attributionControl={true}
      >
        <TileLayer url={CARTO_DARK} attribution={ATTRIBUTION} maxZoom={19} />

        {/* Earthquake halo — rendered first so everything else sits on top */}
        <EarthquakeHalo epicenter={epicenter} />

        {/* Building density clusters — each dot colored by its distance to epicenter */}
        {zones.map((zone) => (
          <BuildingCluster key={`cluster-${zone.id}`} zone={zone} epicenter={epicenter} />
        ))}

        {/* Zone circle markers — subtle highlight when hoveredZoneId matches */}
        {zones.map((zone) => (
          <ZoneCircle
            key={zone.id}
            zone={zone}
            epicenter={epicenter}
            isHighlighted={hoveredZoneId === zone.id}
            isDimmed={hoveredZoneId !== null && hoveredZoneId !== zone.id}
          />
        ))}

        {/* Infrastructure icons — placed well outside the zone cluster */}
        <InfraMarkers />
      </MapContainer>

      {/* Zone legend — interactive, collapsible zone list */}
      <MapLegend
        zones={zones}
        onHoverZone={setHoveredZoneId}
      />
    </div>
  );
}
