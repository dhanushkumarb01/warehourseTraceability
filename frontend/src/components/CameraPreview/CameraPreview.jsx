/**
 * CameraPreview — live preview for every stream type.
 *
 * Reusable across the registration form and the camera detail page.
 *   - UPLOADED_VIDEO: plays the selected file (or a provided src).
 *   - LOCAL_WEBCAM:   enumerates webcams and previews the chosen device.
 *   - HTTP:           renders the endpoint as an <img> (MJPEG / snapshot).
 *   - RTSP / RTMP:    browsers cannot play these natively — shows a clear
 *                     "requires backend proxy" panel (the architecture is
 *                     prepared for an HLS/WebRTC gateway later).
 *
 * Pure presentation; no business logic. Cleans up media tracks on unmount.
 *
 * Props:
 *   streamType {string}
 *   streamUrl  {string}
 *   file       {File}    optional — for UPLOADED_VIDEO in the form
 *   compact    {boolean}
 */

import { useEffect, useRef, useState } from 'react';
import styles from './CameraPreview.module.css';

function CameraPreview({ streamType, streamUrl, file = null, compact = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState(null);
  const [imgError, setImgError] = useState(false);
  const objectUrl = file ? URL.createObjectURL(file) : null;

  // Revoke object URL on change/unmount.
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  // ── Webcam handling ─────────────────────────────────────────────────────
  const stopStream = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };

  useEffect(() => {
    if (streamType !== 'LOCAL_WEBCAM') { stopStream(); return undefined; }
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        // A first getUserMedia unlocks device labels.
        const initial = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) { initial.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = initial;
        if (videoRef.current) videoRef.current.srcObject = initial;
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        if (!cancelled) { setDevices(list); setDeviceId(list[0]?.deviceId || ''); }
      } catch (err) {
        if (!cancelled) setError(err.name === 'NotAllowedError' ? 'Camera permission denied.' : 'No webcam available.');
      }
    })();
    return () => { cancelled = true; stopStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamType]);

  // Switch webcam device.
  useEffect(() => {
    if (streamType !== 'LOCAL_WEBCAM' || !deviceId) return;
    let cancelled = false;
    (async () => {
      try {
        stopStream();
        const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch { /* ignore — handled above */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const frameCls = `${styles.frame} ${compact ? styles.compact : ''}`;

  // ── UPLOADED VIDEO ──────────────────────────────────────────────────────
  if (streamType === 'UPLOADED_VIDEO') {
    const src = objectUrl || streamUrl;
    return (
      <div className={frameCls}>
        {src
          ? <video className={styles.media} src={src} controls autoPlay loop muted playsInline />
          : <Placeholder icon="upload" title="No video selected" text="Choose an uploaded video file to preview it here." />}
        <span className={styles.live}>FILE</span>
      </div>
    );
  }

  // ── LOCAL WEBCAM ────────────────────────────────────────────────────────
  if (streamType === 'LOCAL_WEBCAM') {
    return (
      <div className={frameCls}>
        {error
          ? <Placeholder icon="camera" title="Webcam unavailable" text={error} />
          : <video ref={videoRef} className={styles.media} autoPlay muted playsInline />}
        {devices.length > 1 && (
          <select className={styles.devicePicker} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Webcam ${i + 1}`}</option>)}
          </select>
        )}
        {!error && <span className={`${styles.live} ${styles.liveOn}`}><i /> LIVE</span>}
      </div>
    );
  }

  // ── HTTP (MJPEG / snapshot) ─────────────────────────────────────────────
  if (streamType === 'HTTP') {
    return (
      <div className={frameCls}>
        {streamUrl && !imgError
          ? <img className={styles.media} src={streamUrl} alt="Live stream" onError={() => setImgError(true)} />
          : <Placeholder icon="link" title={streamUrl ? 'Preview unavailable' : 'No stream URL'} text={streamUrl ? 'The endpoint did not return a viewable image. It may require a backend proxy.' : 'Enter an HTTP/MJPEG stream URL to preview.'} />}
        <span className={styles.live}>HTTP</span>
      </div>
    );
  }

  // ── RTSP / RTMP (needs backend proxy) ───────────────────────────────────
  let host = '';
  try { host = streamUrl ? new URL(streamUrl).host : ''; } catch { host = ''; }
  return (
    <div className={frameCls}>
      <Placeholder
        icon="shield"
        title={`${streamType} stream`}
        text={`Browsers can't play ${streamType} directly. A backend media gateway (HLS/WebRTC) will proxy this feed.${host ? ` Endpoint: ${host}` : ''}`}
      />
      <span className={styles.live}>{streamType}</span>
    </div>
  );
}

function Placeholder({ icon, title, text }) {
  const icons = {
    upload: 'M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6.1 4.5 4.5 0 0117 15h-1m-6 1V8m0 0L7 11m3-3l3 3',
    camera: 'M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
    link: 'M13.83 7.17a4 4 0 010 5.66l-3 3a4 4 0 01-5.66-5.66l1.5-1.5M10.17 16.83a4 4 0 010-5.66l3-3a4 4 0 015.66 5.66l-1.5 1.5',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  };
  return (
    <div className={styles.placeholder}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path strokeLinecap="round" strokeLinejoin="round" d={icons[icon] || icons.camera} /></svg>
      <span className={styles.phTitle}>{title}</span>
      <span className={styles.phText}>{text}</span>
    </div>
  );
}

export default CameraPreview;
