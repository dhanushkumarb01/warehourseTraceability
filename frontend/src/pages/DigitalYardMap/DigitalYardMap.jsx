/**
 * DigitalYardMap Page
 *
 * The "5-second" overview: how full is the yard, and what needs attention.
 *
 * Layout:
 *   - Header:   title, Map / Grid switch, live indicator + refresh.
 *   - Summary:  occupancy ring + KPI cards (free, in use, trucks, alerts).
 *   - Stage:    Leaflet map (BayPolygon / BayMarker, ZoneOverlay) or the
 *               schematic YardLayoutView, with the legend and BayInfoPanel
 *               floating over it.
 *   - Aside:    "Needs attention" — plain-language items built from data the
 *               page already loads, each with one action.
 *
 * Data: bays + inventory summary (fetchAllBays / fetchInventorySummary) are
 * essential and refresh quietly every 60s. The truck dashboard and the
 * security-alert summary are read-only extras: if either fails, its cards show
 * "—" and nothing else is affected.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { fetchAllBays } from '../../services/bayService';
import { fetchInventorySummary } from '../../services/mappingService';
import { fetchTruckDashboard } from '../../services/truckService';
import { fetchAlertSummary } from '../../services/surveillanceService';
import { computeMapCenter, computeMapZoom } from '../../utils/mapUtils';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';

import BayMarker           from '../../components/Map/BayMarker';
import BayPolygon          from '../../components/Map/BayPolygon';
import MapViewSetter       from '../../components/Map/MapViewSetter';
import BayInfoPanel        from '../../components/Map/BayInfoPanel';
import MapLegend           from '../../components/Map/MapLegend';
import ZoneOverlay         from '../../components/Map/ZoneOverlay';
import VisualizationToggle from '../../components/Map/VisualizationToggle';
import YardLayoutView      from '../../components/Map/YardLayoutView';
import {
  PageHeader, StatCard, ProgressRing, Card, InsightList, LiveIndicator, ErrorState, EmptyState, Button, IconButton, Skeleton,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';

import styles from './DigitalYardMap.module.css';

const REFRESH_MS = 60000;

const TILES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    subdomains: 'abcd',
  },
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    subdomains: 'abc',
  },
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ─── Component ────────────────────────────────────────────────────────────────

function DigitalYardMap() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { can } = useAuth();
  const canSeeAlerts = can(GROUPS.SURVEILLANCE_VIEW);

  // ── Data state ────────────────────────────────────────────────────────────
  const [bays,        setBays]        = useState([]);
  const [inventorySummary, setInventorySummary] = useState({});
  const [trucks,      setTrucks]      = useState(undefined); // undefined = loading, null = failed
  const [alerts,      setAlerts]      = useState(undefined);
  const [isLoading,   setIsLoading]   = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [fetchError,  setFetchError]  = useState(null);
  const [updatedAt,   setUpdatedAt]   = useState(null);
  const [selectedBay, setSelectedBay] = useState(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('map');
  const [filter, setFilter] = useState('ALL');
  const [asideOpen, setAsideOpen] = useState(true);

  // ── Derived map geometry (recalculated only when bays change) ─────────────
  const mapCenter = useMemo(() => computeMapCenter(bays), [bays]);
  const mapZoom   = useMemo(() => computeMapZoom(bays),   [bays]);

  const uniqueZones = useMemo(() => {
    const zones = new Set(bays.map((b) => b.zone).filter(Boolean));
    return Array.from(zones).sort();
  }, [bays]);

  const visibleBays = useMemo(
    () => (filter === 'ALL' ? bays : bays.filter((b) => b.status === filter)),
    [bays, filter],
  );

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const available = bays.filter((b) => b.status === 'AVAILABLE').length;
    const occupied = bays.filter((b) => b.status === 'OCCUPIED').length;
    const inactive = bays.filter((b) => b.status === 'INACTIVE').length;
    const usable = available + occupied;
    return {
      total: bays.length,
      available, occupied, inactive, usable,
      pctFull: usable ? Math.round((occupied / usable) * 100) : 0,
      lotsStored: Object.values(inventorySummary).reduce((sum, s) => sum + (s?.lotCount || 0), 0),
    };
  }, [bays, inventorySummary]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const selectedIdRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedBay?.id ?? null; }, [selectedBay]);

  const loadBays = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true); else { setIsLoading(true); setFetchError(null); }
    try {
      // Bays are essential; the inventory summary is additive — never let an
      // inventory hiccup block the core yard view.
      const [data, summary] = await Promise.all([
        fetchAllBays(),
        fetchInventorySummary().catch(() => ({})),
      ]);
      setBays(data);
      setInventorySummary(summary || {});
      setFetchError(null);
      setUpdatedAt(new Date());
      // Keep the open info card pointing at fresh data.
      if (selectedIdRef.current) setSelectedBay(data.find((b) => b.id === selectedIdRef.current) || null);
    } catch (err) {
      if (!silent) setFetchError(err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadExtras = useCallback(() => {
    fetchTruckDashboard().then(setTrucks).catch(() => setTrucks(null));
    if (canSeeAlerts) fetchAlertSummary().then(setAlerts).catch(() => setAlerts(null));
    else setAlerts(null);
  }, [canSeeAlerts]);

  useEffect(() => { loadBays(); loadExtras(); }, [loadBays, loadExtras]);

  useEffect(() => {
    const id = setInterval(() => { loadBays({ silent: true }); loadExtras(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadBays, loadExtras]);

  const refreshAll = () => { loadBays({ silent: true }); loadExtras(); };

  // ── Needs attention (from data already loaded) ────────────────────────────
  const attention = useMemo(() => {
    if (isLoading) return [];
    const items = [];
    const critical = alerts?.severity?.CRITICAL || 0;
    const openAlerts = alerts?.active || 0;
    if (critical > 0) {
      items.push({
        id: 'alerts-critical', tone: 'danger', icon: Icons.error, rank: 0,
        title: `${plural(critical, 'critical security alert', 'critical security alerts')}`,
        detail: 'Someone should check the camera footage right away.',
        action: { label: 'Review alerts', onClick: () => navigate('/surveillance/alerts') },
      });
    } else if (openAlerts > 0) {
      items.push({
        id: 'alerts-open', tone: 'warning', icon: Icons.bell, rank: 2,
        title: `${plural(openAlerts, 'security alert is', 'security alerts are')} waiting`,
        detail: `${alerts.today || 0} raised today. Mark them as seen or resolved.`,
        action: { label: 'Review alerts', onClick: () => navigate('/surveillance/alerts') },
      });
    }

    const flagged = trucks?.insideYard?.filter((t) => t.riskStatus === 'FLAGGED') || [];
    if (flagged.length) {
      items.push({
        id: 'trucks-flagged', tone: 'danger', icon: Icons.warning, rank: 0,
        title: `${plural(flagged.length, 'truck has', 'trucks have')} been flagged`,
        detail: `${flagged.slice(0, 2).map((t) => t.truckNumber).join(', ')}${flagged.length > 2 ? '…' : ''} broke the expected route. Check before it leaves.`,
        action: { label: 'See trucks', onClick: () => navigate('/trucks') },
      });
    }
    const delayed = trucks?.insideYard?.filter((t) => t.riskStatus === 'DELAYED') || [];
    if (delayed.length) {
      const longest = [...delayed].sort((a, b) => b.minutesInStage - a.minutesInStage)[0];
      items.push({
        id: 'trucks-delayed', tone: 'warning', icon: Icons.clock, rank: 1,
        title: `${plural(delayed.length, 'truck is', 'trucks are')} taking longer than usual`,
        detail: `${longest.truckNumber} has been at the same step for ${longest.minutesInStage} min.`,
        action: { label: 'See trucks', onClick: () => navigate('/trucks') },
      });
    }

    if (stats.usable > 0) {
      if (stats.available === 0) {
        items.push({
          id: 'yard-full', tone: 'danger', icon: Icons.boxes, rank: 0,
          title: 'No free storage spots left',
          detail: 'New material has nowhere to go. Move or send out stored batches.',
          action: { label: 'Open storage', onClick: () => navigate('/inbound?tab=storage') },
        });
      } else if (stats.pctFull >= 85) {
        items.push({
          id: 'yard-filling', tone: 'warning', icon: Icons.boxes, rank: 1,
          title: `Only ${plural(stats.available, 'storage spot', 'storage spots')} left`,
          detail: `The yard is ${stats.pctFull}% full. Plan where the next arrivals will go.`,
          action: { label: 'Show free spots', onClick: () => { setFilter('AVAILABLE'); } },
        });
      }
    }
    if (stats.inactive > 0) {
      items.push({
        id: 'spots-off', tone: 'info', icon: Icons.ban, rank: 3,
        title: `${plural(stats.inactive, 'storage spot is', 'storage spots are')} out of use`,
        detail: 'They can’t take material until someone turns them back on.',
        action: { label: 'Show them on the map', onClick: () => { setFilter('INACTIVE'); } },
      });
    }
    return items.sort((a, b) => a.rank - b.rank).slice(0, 5);
  }, [isLoading, alerts, trucks, stats, navigate]);

  // ── KPI wording ───────────────────────────────────────────────────────────
  const fullness = stats.pctFull >= 90
    ? { tone: 'danger', word: 'Almost full', icon: Icons.error }
    : stats.pctFull >= 70
      ? { tone: 'warning', word: 'Filling up', icon: Icons.warning }
      : { tone: 'success', word: 'Plenty of space', icon: Icons.checkCircle };

  const truckDelayed = trucks?.delayedCount || 0;
  const critical = alerts?.severity?.CRITICAL || 0;
  const openAlerts = alerts?.active ?? null;

  const tiles = TILES[theme] || TILES.dark;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <PageHeader
        icon={Icons.map}
        title="Yard map"
        subtitle="How full the yard is right now, and what needs your attention."
        actions={(
          <>
            <VisualizationToggle activeView={activeView} onChange={setActiveView} />
            <LiveIndicator updatedAt={updatedAt} onRefresh={refreshAll} refreshing={refreshing} />
          </>
        )}
      />

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <section className={styles.summary} aria-label="Yard summary">
        <div className={`${styles.hero} ${styles[`hero_${fullness.tone}`]}`}>
          {isLoading ? (
            <>
              <Skeleton width={112} height={112} radius={999} />
              <div className={styles.heroText}><Skeleton width="70%" height={22} /><Skeleton width="90%" height={14} /></div>
            </>
          ) : (
            <>
              <ProgressRing
                value={stats.pctFull}
                size={112}
                stroke={11}
                tone={fullness.tone === 'success' ? 'teal' : fullness.tone === 'warning' ? 'orange' : 'danger'}
                label={`Yard is ${stats.pctFull}% full`}
              >
                <span className={`${styles.heroPct} wt-num`}>{stats.pctFull}%</span>
                <span className={styles.heroPctLabel}>full</span>
              </ProgressRing>
              <div className={styles.heroText}>
                <span className={`${styles.heroChip} ${styles[`chip_${fullness.tone}`]}`}>{fullness.icon}{fullness.word}</span>
                <p className={styles.heroTitle}>
                  <span className="wt-num">{stats.available}</span> of <span className="wt-num">{stats.usable}</span> storage spots are free
                </p>
                <p className={styles.heroHint}>
                  {stats.inactive > 0 ? `${plural(stats.inactive, 'spot is', 'spots are')} out of use and not counted.` : 'Every storage spot is in service.'}
                </p>
              </div>
            </>
          )}
        </div>

        <StatCard
          icon={Icons.circle}
          label="Free spots"
          value={isLoading ? null : stats.available}
          unit="spots"
          tone="teal"
          hint="Ready to take material now"
          status={!isLoading && stats.available === 0 ? 'None left' : undefined}
          loading={isLoading}
          onClick={() => setFilter(filter === 'AVAILABLE' ? 'ALL' : 'AVAILABLE')}
          help="Storage spots (bays) that are empty and in service. Click to show only these on the map."
        />
        <StatCard
          icon={Icons.circleFull}
          label="In use"
          value={isLoading ? null : stats.occupied}
          unit="spots"
          tone="orange"
          hint={`${plural(stats.lotsStored, 'batch', 'batches')} of material stored`}
          loading={isLoading}
          onClick={() => setFilter(filter === 'OCCUPIED' ? 'ALL' : 'OCCUPIED')}
          help="Storage spots that are holding material. A batch is one lot of a material."
        />
        <StatCard
          icon={Icons.truck}
          label="Trucks in yard"
          value={trucks === undefined ? null : trucks === null ? null : trucks.insideYardCount}
          unit="trucks"
          tone={trucks && truckDelayed > 0 ? 'warning' : 'info'}
          status={trucks ? (truckDelayed > 0 ? `${truckDelayed} delayed` : 'On time') : undefined}
          statusIcon={trucks ? (truckDelayed > 0 ? Icons.clock : Icons.check) : undefined}
          hint={trucks === null ? 'Couldn’t load truck data' : trucks ? `${trucks.exitedTodayCount} left today · avg ${trucks.avgTurnaroundMins || 0} min inside` : undefined}
          loading={trucks === undefined}
          onClick={() => navigate('/trucks')}
          help="Trucks that have entered through the gate and not left yet."
        />
        <StatCard
          icon={Icons.bell}
          label="Open alerts"
          value={alerts === undefined || alerts === null ? null : openAlerts}
          unit="alerts"
          tone={critical > 0 ? 'danger' : openAlerts > 0 ? 'warning' : 'success'}
          status={alerts ? (critical > 0 ? `${critical} critical` : openAlerts > 0 ? 'Check soon' : 'All clear') : undefined}
          hint={alerts === null ? (canSeeAlerts ? 'Couldn’t load alerts' : 'Not available for your role') : alerts ? `${alerts.today || 0} raised today` : undefined}
          loading={alerts === undefined}
          onClick={canSeeAlerts ? () => navigate('/surveillance/alerts') : undefined}
          help="Security alerts from the cameras that nobody has resolved yet."
        />
      </section>

      {/* ── Main: map stage + attention panel ───────────────────────────── */}
      <div className={`${styles.main} ${asideOpen ? '' : styles.mainWide}`}>
        <div className={styles.stageWrap}>
          <div className={styles.stage}>
            {isLoading && (
              <div className={styles.overlay}>
                <div className={styles.loadingCard}>
                  <span className={styles.spinner} />
                  <span>Loading the yard…</span>
                </div>
              </div>
            )}

            {!isLoading && fetchError && (
              <div className={styles.overlay}>
                <div className={styles.overlayCard}>
                  <ErrorState title="We couldn’t load the yard" error={fetchError} onRetry={() => loadBays()} />
                </div>
              </div>
            )}

            {!isLoading && !fetchError && bays.length === 0 && (
              <div className={styles.overlay}>
                <div className={styles.overlayCard}>
                  <EmptyState
                    icon={Icons.map}
                    title="No storage spots yet"
                    message="Add your first storage spot to see the yard here."
                    action={<Button variant="primary" icon={Icons.plus} onClick={() => navigate('/inbound?tab=layout')}>Add storage spots</Button>}
                  />
                </div>
              </div>
            )}

            {activeView === 'map' && (
              <MapContainer center={mapCenter} zoom={mapZoom} className={styles.map} zoomControl attributionControl>
                <TileLayer key={theme} url={tiles.url} attribution={tiles.attribution} subdomains={tiles.subdomains} maxZoom={19} />

                {!isLoading && bays.length > 0 && <MapViewSetter center={mapCenter} zoom={mapZoom} />}

                {uniqueZones.map((zone) => (
                  <ZoneOverlay key={zone} zoneName={zone} bays={bays.filter((b) => b.zone === zone)} />
                ))}

                {visibleBays.map((bay) => (
                  <BayPolygon key={`poly-${bay.id}`} bay={bay} isSelected={selectedBay?.id === bay.id} onSelect={setSelectedBay} />
                ))}
                {visibleBays.map((bay) => (
                  <BayMarker key={`marker-${bay.id}`} bay={bay} isSelected={selectedBay?.id === bay.id} onSelect={setSelectedBay} />
                ))}
              </MapContainer>
            )}

            {activeView === 'layout' && !isLoading && !fetchError && (
              <YardLayoutView
                bays={visibleBays}
                selectedBay={selectedBay}
                onSelectBay={setSelectedBay}
                inventorySummary={inventorySummary}
              />
            )}

            {!isLoading && !fetchError && bays.length > 0 && !selectedBay && activeView === 'map' && (
              <div className={styles.mapHint}>{Icons.info}Click a storage spot to see what’s inside</div>
            )}

            {!isLoading && !fetchError && bays.length > 0 && (
              <div className={styles.legendSlot}>
                <MapLegend
                  counts={{ AVAILABLE: stats.available, OCCUPIED: stats.occupied, INACTIVE: stats.inactive }}
                  filter={filter}
                  onFilter={setFilter}
                />
              </div>
            )}

            <div className={styles.infoSlot}>
              <BayInfoPanel bay={selectedBay} onClose={() => setSelectedBay(null)} />
            </div>
          </div>
        </div>

        {/* ── Needs attention ───────────────────────────────────────────── */}
        {asideOpen ? (
          <Card
            className={styles.aside}
            glass
            icon={Icons.sparkles}
            title="Needs attention"
            subtitle={isLoading ? 'Checking…' : attention.length ? `${plural(attention.length, 'thing', 'things')} to look at today` : 'Nothing urgent right now'}
            actions={<IconButton icon={Icons.chevronRight} label="Hide panel" size="sm" onClick={() => setAsideOpen(false)} />}
          >
            <InsightList items={attention} loading={isLoading} />
            {!isLoading && (
              <div className={styles.quick}>
                <p className={styles.quickTitle}>Quick filters</p>
                <div className={styles.chips}>
                  {[
                    ['ALL', 'All spots'],
                    ['AVAILABLE', 'Free'],
                    ['OCCUPIED', 'In use'],
                    ['INACTIVE', 'Out of use'],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={`${styles.chip} ${filter === v ? styles.chipActive : ''}`}
                      aria-pressed={filter === v}
                      onClick={() => setFilter(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ) : (
          <button type="button" className={styles.asideTab} onClick={() => setAsideOpen(true)} aria-label="Show needs attention panel">
            {Icons.sparkles}
            <span>Needs attention</span>
            {attention.length > 0 && <span className={`${styles.asideCount} wt-num`}>{attention.length}</span>}
          </button>
        )}
      </div>
    </div>
  );
}

export default DigitalYardMap;
