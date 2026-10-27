/**
 * ZoneEditor — define a camera's boundary polygon by clicking on the frame.
 *
 * Reusable for any zone-based use case (boundary, restricted, parking, loading,
 * weighbridge, wagon). Coordinates are normalised (0–1) so a zone works at any
 * capture resolution. The live feed is shown behind the drawing surface so the
 * operator can trace the real warehouse boundary.
 *
 * Props:
 *   camera       {object}   the camera (for the live backdrop)
 *   zones        {array}    existing zones of this family (the first is edited)
 *   canManage    {boolean}
 *   onSave       {function} (zones[]) => Promise   (this family's zones)
 *   fixedType    {string}   optional — lock the zone type (hides the selector)
 *   defaultName  {string}   optional — default name for a new zone
 *   defaultType  {string}   optional — default selected type when not fixed
 */

import { useState, useRef, useEffect } from 'react';
import LiveStreamPlayer from '../LiveStreamPlayer/LiveStreamPlayer';
import { Button } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
import styles from './ZoneEditor.module.css';

const BOUNDARY_ZONE_TYPES = ['BOUNDARY', 'RESTRICTED', 'PARKING', 'LOADING', 'WEIGHBRIDGE'];

function ZoneEditor({ camera, zones = [], canManage = false, onSave, fixedType = null, defaultName = 'Warehouse Boundary', defaultType = 'BOUNDARY' }) {
  const svgRef = useRef(null);
  const existing = zones[0] || null;
  const [points, setPoints] = useState(existing?.polygon || []);
  const [name, setName] = useState(existing?.name || defaultName);
  const [type, setType] = useState(existing?.type || fixedType || defaultType);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) { setPoints(existing.polygon || []); setName(existing.name || defaultName); setType(existing.type || fixedType || defaultType); }
    else { setPoints([]); setName(defaultName); setType(fixedType || defaultType); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const addPoint = (e) => {
    if (!canManage) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setPoints((p) => [...p, [Number(x.toFixed(4)), Number(y.toFixed(4))]]);
  };

  const undo = () => setPoints((p) => p.slice(0, -1));
  const clear = () => setPoints([]);

  const save = async () => {
    setSaving(true);
    try {
      const zoneType = fixedType || type;
      const zoneId = existing?.id || `${zoneType.toLowerCase()}-1`;
      await onSave(points.length >= 3 ? [{ id: zoneId, name, type: zoneType, polygon: points }] : []);
    } finally { setSaving(false); }
  };

  const polyAttr = points.map((p) => `${p[0] * 100},${p[1] * 100}`).join(' ');

  return (
    <div className={styles.editor}>
      <div className={styles.stage}>
        <div className={styles.bg}><LiveStreamPlayer key={camera.id} camera={camera} /></div>
        <svg
          ref={svgRef}
          className={styles.overlay}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onClick={addPoint}
          style={{ cursor: canManage ? 'crosshair' : 'default' }}
        >
          {points.length >= 2 && (
            <polygon points={polyAttr} className={styles.poly} vectorEffect="non-scaling-stroke" />
          )}
          {points.map((p, i) => (
            <circle key={i} cx={p[0] * 100} cy={p[1] * 100} r="1.1" className={styles.vertex} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <span className={styles.hint}>{canManage ? (points.length === 0 ? 'Click on the picture to mark the corners' : `${points.length} corner${points.length > 1 ? 's' : ''} marked — at least 3 needed`) : 'View only'}</span>
      </div>

      {canManage && (
        <div className={styles.controls}>
          <input className={`${uiStyles.input} ${styles.input}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Area name" aria-label="Area name" />
          {!fixedType && (
            <select className={`${uiStyles.input} ${styles.input}`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Area type">
              {BOUNDARY_ZONE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
            </select>
          )}
          <Button variant="ghost" icon={Icons.arrowLeft} onClick={undo} disabled={!points.length}>Undo last point</Button>
          <Button variant="ghost" icon={Icons.close} onClick={clear} disabled={!points.length}>Clear</Button>
          <Button variant={points.length === 0 ? 'danger' : 'primary'} icon={Icons.check} onClick={save} loading={saving} disabled={points.length > 0 && points.length < 3}>
            {points.length === 0 ? 'Remove area' : 'Save area'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default ZoneEditor;
