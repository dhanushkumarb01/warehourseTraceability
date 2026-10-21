/**
 * DigitalYardMap Page
 *
 * Orchestrates the complete Yard Visibility module.
 *
 * Architecture:
 *   - Data fetching: single API call, shared between both views.
 *   - View state:   'map' | 'layout' — controlled by VisualizationToggle.
 *   - Map View:     Leaflet map with BayPolygon (or BayMarker fallback),
 *                   ZoneOverlay bounding boxes, MapLegend, BayInfoPanel.
 *   - Layout View:  YardLayoutView — pure React, no Leaflet dependency.
 *   - BayInfoPanel: used by BOTH views — decoupled from map, receives bay prop.
 *   - Stats strip:  always visible above both views.
 *
 * State:
 *   bays        — raw bay array from API
 *   isLoading   — true while initial fetch is in flight
 *   fetchError  — error string or null
 *   selectedBay — clicked bay object or null (shared across both views)
 *   activeView  — 'map' | 'layout'
 *
 * No duplicate API logic. The existing `fetchAllBays` from bayService is
 * the single data source for this entire page.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { fetchAllBays } from '../../services/bayService';
import { fetchInventorySummary } from '../../services/mappingService';
import { computeMapCenter, computeMapZoom } from '../../utils/mapUtils';

import BayMarker          from '../../components/Map/BayMarker';
import BayPolygon         from '../../components/Map/BayPolygon';
import MapViewSetter      from '../../components/Map/MapViewSetter';
import BayInfoPanel       from '../../components/Map/BayInfoPanel';
import MapLegend          from '../../components/Map/MapLegend';
import ZoneOverlay        from '../../components/Map/ZoneOverlay';
import VisualizationToggle from '../../components/Map/VisualizationToggle';
import YardLayoutView     from '../../components/Map/YardLayoutView';

import styles from './DigitalYardMap.module.css';

// ─── Component ────────────────────────────────────────────────────────────────

function DigitalYardMap() {
  // ── Data state ────────────────────────────────────────────────────────────
  const [bays,        setBays]        = useState([]);
  const [inventorySummary, setInventorySummary] = useState({});
  const [isLoading,   setIsLoading]   = useState(true);
  const [fetchError,  setFetchError]  = useState(null);
  const [selectedBay, setSelectedBay] = useState(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('map');

  // ── Derived map geometry (recalculated only when bays change) ─────────────
  const mapCenter = useMemo(() => computeMapCenter(bays), [bays]);
  const mapZoom   = useMemo(() => computeMapZoom(bays),   [bays]);

  const uniqueZones = useMemo(() => {
    const zones = new Set(bays.map(b => b.zone).filter(Boolean));
    return Array.from(zones).sort();
  }, [bays]);

  // ── Derived stats (recalculated only when bays change) ────────────────────
  const stats = useMemo(() => ({
    totalZones: uniqueZones.length,
    totalBays:  bays.length,
    available:  bays.filter((b) => b.status === 'AVAILABLE').length,
    occupied:   bays.filter((b) => b.status === 'OCCUPIED').length,
    inactive:   bays.filter((b) => b.status === 'INACTIVE').length,
    lotsStored: Object.values(inventorySummary).reduce((sum, s) => sum + (s?.lotCount || 0), 0),
  }), [bays, uniqueZones, inventorySummary]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const loadBays = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    setSelectedBay(null);
    try {
      // Bays are essential; the inventory summary is additive — never let an
      // inventory hiccup block the core yard view.
      const [data, summary] = await Promise.all([
        fetchAllBays(),
        fetchInventorySummary().catch(() => ({})),
      ]);
      setBays(data);
      setInventorySummary(summary || {});
    } catch (err) {
      setFetchError(err.message || 'Failed to load bay data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadBays(); }, [loadBays]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Yard Overview</h1>
            <p className={styles.pageSubtitle}>
              Warehouse capacity summary and zone distribution
            </p>
          </div>
        </div>

        <div className={styles.pageHeaderRight}>
          <VisualizationToggle activeView={activeView} onChange={setActiveView} />
          <button
            className={styles.refreshBtn}
            onClick={loadBays}
            disabled={isLoading}
            title="Refresh bay data"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={isLoading ? styles.spinning : ''}
            >
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats Strip ──────────────────────────────────────────────────── */}
      <div className={styles.statsStrip}>
        <StatCard label="Total Zones"    value={isLoading ? '—' : stats.totalZones} accent="#6366f1" bg="#eef2ff" />
        <StatCard label="Total Bays"     value={isLoading ? '—' : stats.totalBays}  accent="#2563eb" bg="#eff6ff" />
        <StatCard label="Available Bays" value={isLoading ? '—' : stats.available}  accent="#16a34a" bg="#f0fdf4" />
        <StatCard label="Occupied Bays"  value={isLoading ? '—' : stats.occupied}   accent="#ca8a04" bg="#fefce8" />
        <StatCard label="Lots Stored"    value={isLoading ? '—' : stats.lotsStored} accent="#7c3aed" bg="#f5f3ff" />
      </div>

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <div className={styles.contentArea}>

        {/* The content area is shared — overlaid panel sits inside it */}

        {/* ── Loading Overlay ───────────────────────────────────── */}
        {isLoading && (
          <div className={styles.overlay}>
            <div className={styles.spinnerWrap}>
              <div className={styles.spinner} />
              <p className={styles.overlayText}>Loading yard data…</p>
            </div>
          </div>
        )}

        {/* ── Error Overlay ─────────────────────────────────────── */}
        {!isLoading && fetchError && (
          <div className={styles.overlay}>
            <div className={styles.errorWrap}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className={styles.overlayTitle}>Unable to load yard data</p>
              <p className={styles.overlayText}>{fetchError}</p>
              <button className={styles.retryBtn} onClick={loadBays}>Try Again</button>
            </div>
          </div>
        )}

        {/* ── MAP VIEW ──────────────────────────────────────────── */}
        {activeView === 'map' && (
          <>
            {/* Empty state inside map view */}
            {!isLoading && !fetchError && bays.length === 0 && (
              <div className={styles.overlay}>
                <div className={styles.emptyWrap}>
                  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" transform="scale(2.4) translate(1,2)" />
                  </svg>
                  <p className={styles.overlayTitle}>No bays available</p>
                  <p className={styles.overlayText}>Create bays in Bay Management to visualise the yard.</p>
                </div>
              </div>
            )}

            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              className={styles.map}
              zoomControl={true}
              attributionControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
                maxZoom={19}
              />

              {/* Auto-update viewport when bay data changes */}
              {!isLoading && bays.length > 0 && (
                <MapViewSetter center={mapCenter} zoom={mapZoom} />
              )}

              {/* Zone bounding boxes */}
              {uniqueZones.map((zone) => (
                <ZoneOverlay
                  key={zone}
                  zoneName={zone}
                  bays={bays.filter((b) => b.zone === zone)}
                />
              ))}

              {/* Bay Polygons (rendered when polygonCoordinates present) */}
              {bays.map((bay) => (
                <BayPolygon
                  key={`poly-${bay.id}`}
                  bay={bay}
                  isSelected={selectedBay?.id === bay.id}
                  onSelect={setSelectedBay}
                />
              ))}

              {/* Bay Markers (fallback for bays without polygon data) */}
              {bays.map((bay) => (
                <BayMarker
                  key={`marker-${bay.id}`}
                  bay={bay}
                  isSelected={selectedBay?.id === bay.id}
                  onSelect={setSelectedBay}
                />
              ))}
            </MapContainer>

            {/* Map legend */}
            {!isLoading && !fetchError && <MapLegend />}

            {/* Hint when nothing selected */}
            {!isLoading && !fetchError && bays.length > 0 && !selectedBay && (
              <div className={styles.mapHint}>
                Click a bay on the map to view details
              </div>
            )}
          </>
        )}

        {/* ── YARD LAYOUT VIEW ──────────────────────────────────── */}
        {activeView === 'layout' && !isLoading && !fetchError && (
          <YardLayoutView
            bays={bays}
            selectedBay={selectedBay}
            onSelectBay={setSelectedBay}
            inventorySummary={inventorySummary}
          />
        )}

        {/* ── Bay Info Panel — shared across both views ─────────── */}
        <BayInfoPanel
          bay={selectedBay}
          onClose={() => setSelectedBay(null)}
        />

      </div>

    </div>
  );
}

// ── Sub-component: Stat card ──────────────────────────────────────────────────
function StatCard({ label, value, accent, bg }) {
  return (
    <div className={styles.statCard} style={{ '--accent': accent, '--bg': bg }}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export default DigitalYardMap;
