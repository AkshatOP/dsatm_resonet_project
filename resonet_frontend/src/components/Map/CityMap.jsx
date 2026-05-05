/**
 * CityMap.jsx
 * Main Leaflet map wrapper.
 * Render order (bottom → top):
 *   1. Earthquake halo  — large dashed circle at epicenter
 *   2. Building clusters — density dots per zone (colored by distance)
 *   3. Power overlay    — blue city-light dots, hidden on power-off zones
 *   4. Zone circles     — interactive zone markers
 *   5. Infra markers    — hospital / fire / rescue icons
 */

import { useState }              from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ZoneCircle      from './ZoneCircle';
import BuildingCluster from './BuildingCluster';
import PowerOverlay    from './PowerOverlay';
import InfraMarkers    from './InfraMarker';
import EarthquakeHalo  from './EarthquakeHalo';
import MapLegend       from './MapLegend';
import EmergencyRoutes from './EmergencyRoutes';

const CARTO_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const CENTER = [12.9716, 77.5946];
const ZOOM   = 13;

export default function CityMap({
  zones,
  epicenter,
  onRouteReady,
  onTriggerFire,
  onTriggerEarthquake,
  isSimulating,
}) {
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

        {/* Power overlay — blue dots for zones outside the 7 km impact radius */}
        <PowerOverlay zones={zones} epicenter={epicenter} />

        {/* Zone circle markers — subtle highlight when hoveredZoneId matches */}
        {zones.map((zone) => (
          <ZoneCircle
            key={zone.id}
            zone={zone}
            epicenter={epicenter}
            isHighlighted={hoveredZoneId === zone.id}
            isDimmed={hoveredZoneId !== null && hoveredZoneId !== zone.id}
            onTriggerFire={onTriggerFire}
            onTriggerEarthquake={onTriggerEarthquake}
            isSimulating={isSimulating}
          />
        ))}

        {/* Infrastructure icons — placed well outside the zone cluster */}
        <InfraMarkers />

        {/* Emergency routing — progressive animated polylines from responders → critical zones */}
        <EmergencyRoutes epicenter={epicenter} active={!!epicenter} zones={zones} onRouteReady={onRouteReady} />
      </MapContainer>

      {/* Zone legend — interactive, collapsible zone list */}
      <MapLegend
        zones={zones}
        onHoverZone={setHoveredZoneId}
      />
    </div>
  );
}
