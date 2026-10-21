/**
 * LiveStreamPlayer — renders one camera's live feed via the backend stream layer.
 *
 * Lifecycle: on mount it opens (joins) the backend session, polls status, and on
 * unmount it leaves — so the backend reference-counts viewers and reuses a single
 * upstream connection. The frontend never touches the camera directly; every
 * pixel arrives through an authenticated backend endpoint, except the local
 * webcam which the browser must capture itself (a server cannot proxy a client's
 * own webcam).
 *
 * Rendering is driven by the backend's playback descriptor (descriptor.kind):
 *   file    → <video> range-served by the backend (uploaded demo, loops as live)
 *   proxy   → <img>  MJPEG/snapshot proxied by the backend (HTTP cameras)
 *   hls     → HLS manifest via the production media gateway (RTSP/RTMP)
 *   gateway → reachable, awaiting media gateway (RTSP/RTMP, no transcoder yet)
 *   webcam  → browser getUserMedia (client-side)
 *
 * No AI overlays. No detection boxes. Clean live video only.
 *
 * Props:
 *   camera         {object}   camera row (id, streamType, …)
 *   refreshSignal  {number}   bump to force a reconnect
 *   showControls   {boolean}  native <video> controls (detail view)
 *   onStatus       {function} optional callback(status) for parent chrome
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { openStream, closeStream, fetchStreamStatus, refreshStream, playbackUrl } from '../../services/streamService';
import styles from './LiveStreamPlayer.module.css';

const POLL_MS = 5000;
const newViewerId = () => `v-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

function LiveStreamPlayer({ camera, refreshSignal = 0, showControls = false, onStatus }) {
  const viewerId = useRef(newViewerId());
  const videoEl = useRef(null);
  const webcamStream = useRef(null);
  const pollTimer = useRef(null);
  const mounted = useRef(true);

  const [status, setStatus] = useState(null); // merged backend status
  const [imgFailed, setImgFailed] = useState(false);
  // True once the media element is actually rendering frames. This is the
  // authoritative "healthy" signal — if frames arrive, the stream is live
  // regardless of any lag/mismatch in the polled backend session status.
  const [mediaLive, setMediaLive] = useState(false);

  const id = camera.id;
  const descriptor = status?.descriptor || camera.stream?.descriptor || null;
  const kind = descriptor?.kind;

  const applyStatus = useCallback((s) => {
    if (!mounted.current || !s) return;
    setStatus(s);
    if (onStatus) onStatus(s);
  }, [onStatus]);

  // Open + poll the backend session.
  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    const viewer = viewerId.current;
    const open = async () => {
      // openStream returns { camera, stream } — use the stream status object.
      try { applyStatus((await openStream(id, viewer))?.stream); }
      catch { /* surfaced via status panel */ }
    };
    const poll = async () => {
      if (stopped) return;
      try { applyStatus(await fetchStreamStatus(id)); } catch { /* keep last */ }
      if (!stopped) pollTimer.current = setTimeout(poll, POLL_MS);
    };
    open();
    pollTimer.current = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      closeStream(id, viewer).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Manual refresh → backend reconnect + immediate status.
  useEffect(() => {
    if (!refreshSignal) return;
    setImgFailed(false);
    setMediaLive(false);
    refreshStream(id).then(applyStatus).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Local webcam capture (client-side; backend can't proxy a client's webcam).
  useEffect(() => {
    if (kind !== 'webcam') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        webcamStream.current = s;
        if (videoEl.current) videoEl.current.srcObject = s;
      } catch { /* handled by overlay (no permission / no device) */ }
    })();
    return () => {
      cancelled = true;
      if (webcamStream.current) { webcamStream.current.getTracks().forEach((t) => t.stop()); webcamStream.current = null; }
    };
  }, [kind]);

  const st = status?.status || camera.stream?.status || 'OFFLINE';
  // Frames actually rendering is the strongest signal the stream is healthy, so
  // it overrides a lagging/mismatched polled session status. "Reconnecting" only
  // shows when frames are NOT arriving AND the backend reports a connecting/lost
  // state — i.e. an actual failure.
  const online = mediaLive || st === 'ONLINE';
  const reconnecting = !mediaLive && (st === 'RECONNECTING' || st === 'CONNECTING');
  const errored = !mediaLive && st === 'ERROR';

  const onFrames = () => setMediaLive(true);

  const renderMedia = () => {
    if (kind === 'file') {
      return <video ref={videoEl} className={styles.media} src={playbackUrl(id)} autoPlay loop muted playsInline controls={showControls}
        onPlaying={onFrames} onLoadedData={onFrames} onError={() => setMediaLive(false)} />;
    }
    if (kind === 'webcam') {
      return <video ref={videoEl} className={styles.media} autoPlay muted playsInline onPlaying={onFrames} onLoadedData={onFrames} />;
    }
    if (kind === 'proxy') {
      return imgFailed
        ? <Panel icon="link" title="Proxy unavailable" text="The backend could not retrieve frames from this HTTP camera." />
        : <img className={styles.media} src={playbackUrl(id)} alt="Live stream" onLoad={onFrames} onError={() => { setMediaLive(false); setImgFailed(true); }} />;
    }
    if (kind === 'hls') {
      // Native HLS (Safari) plays the manifest directly; other browsers need a
      // media-source library which the gateway phase will wire in.
      return <video ref={videoEl} className={styles.media} src={playbackUrl(id)} autoPlay muted playsInline controls={showControls}
        onPlaying={onFrames} onLoadedData={onFrames} onError={() => setMediaLive(false)} />;
    }
    // gateway pending (RTSP/RTMP reachable, no transcoder yet) or unknown
    return (
      <Panel
        icon="shield"
        title={descriptor?.protocol ? `${descriptor.protocol} reachable` : 'Awaiting media gateway'}
        text={online || st === 'OFFLINE'
          ? 'Camera reachable. Live playback will appear once the media gateway (HLS/WebRTC) is enabled for RTSP/RTMP.'
          : (status?.error || 'Connecting to the camera…')}
      />
    );
  };

  return (
    <div className={styles.frame}>
      {renderMedia()}

      {/* status overlay */}
      <div className={styles.overlayTop}>
        <span className={`${styles.badge} ${online ? styles.live : reconnecting ? styles.warn : errored ? styles.err : styles.idle}`}>
          {online ? <><i className={styles.dot} /> LIVE</> : st}
        </span>
      </div>

      {(status?.resolution || status?.fps) && (
        <div className={styles.overlayMetrics}>
          {status.resolution && <span>{status.resolution}</span>}
          {status.fps != null && <span>{status.fps} fps</span>}
        </div>
      )}

      {reconnecting && (
        <div className={styles.reconnect}><span className={styles.spinner} /> {st === 'CONNECTING' ? 'Connecting…' : 'Reconnecting…'}</div>
      )}
      {errored && (
        <div className={styles.errorBar}>{status?.error || 'Stream error.'}</div>
      )}
    </div>
  );
}

function Panel({ icon, title, text }) {
  const icons = {
    link: 'M13.83 7.17a4 4 0 010 5.66l-3 3a4 4 0 01-5.66-5.66l1.5-1.5M10.17 16.83a4 4 0 010-5.66l3-3a4 4 0 015.66 5.66l-1.5 1.5',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  };
  return (
    <div className={styles.panel}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path strokeLinecap="round" strokeLinejoin="round" d={icons[icon] || icons.shield} /></svg>
      <span className={styles.panelTitle}>{title}</span>
      <span className={styles.panelText}>{text}</span>
    </div>
  );
}

export default LiveStreamPlayer;
