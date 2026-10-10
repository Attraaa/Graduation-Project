import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { CameraOff, FlipHorizontal2, FlipVertical2, RotateCw, RotateCcw, ScanLine, Hand, MousePointer2, Maximize } from 'lucide-react';
import { getLearningMode } from '../../data/modes';
import { useCameraSettings } from './context';
import { defaultQuad, validQuad, type GridSettings, type Point, type Quad } from './profile';
import { displayedGrid, gridPolygons } from './grid';
import WindowTitleBar from '../../components/layout/WindowTitleBar';
import { normalizeFraming, unframePoint, zoomFraming, type CameraFraming } from './framing';

export default function CameraSettingsPanel({ selection }: { selection?: ReactNode }) {
  const camera = useCameraSettings();
  const { profile, runtime, connected, update, setGrid } = camera;
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ corner: number | null; start: Point; quad: Quad } | null>(null);
  const [ratio, setRatio] = useState(16 / 9);
  const image = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(700);
  const [tool, setTool] = useState<'edit' | 'move'>(camera.modeId === 'keyboard' ? 'edit' : 'move');
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ pointerId: number; start: Point; frame: CameraFraming } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState<MediaTrackSettings & { exposureTime?: number; exposureMode?: string }>({});
  const [caps, setCaps] = useState<(MediaTrackCapabilities & { exposureMode?: string[]; exposureTime?: { min: number; max: number; step?: number } }) | undefined>();
  const { setEditing } = camera;
  useEffect(() => {
    let frame = 0, last = -Infinity;
    const draw = (now: number) => {
      const target = canvas.current, source = runtime.current.canvas;
      if (target && now - last >= 30) {
        const context = target.getContext('2d');
        if (source?.width && source.height && context) {
          if (target.width !== source.width || target.height !== source.height) { target.width = source.width; target.height = source.height; setRatio(source.width / source.height); }
          context.drawImage(source, 0, 0);
          const overlay = runtime.current.overlay;
          if (camera.modeId !== 'keyboard' && overlay?.width) context.drawImage(overlay, 0, 0, target.width, target.height);
        } else context?.clearRect(0, 0, target.width, target.height);
        last = now;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const timer = window.setInterval(() => { setSettings(runtime.current.track?.getSettings() ?? {}); setCaps(runtime.current.track?.getCapabilities()); }, 500);
    const parent = image.current;
    // Observe in the child document's realm; a parent-window observer cannot
    // complete delivery for elements in a separate native window.
    const Observer = (parent?.ownerDocument.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver ?? ResizeObserver;
    let resizeFrame = 0;
    const observer = new Observer(entries => {
      const { width } = entries[0].contentRect;
      cancelAnimationFrame(resizeFrame);
      // Scale labels/handles after delivery; CSS alone fits the video frame.
      resizeFrame = requestAnimationFrame(() => setPreviewWidth(width));
    });
    if (parent) observer.observe(parent);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame); window.clearInterval(timer); observer.disconnect(); setEditing(false); };
  }, [runtime, camera.modeId, setEditing]);
  useEffect(() => {
    const element = image.current;
    if (!element || !connected) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (pan.current || runtime.current.editing) return;
      const rect = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      update(zoomFraming(runtime.current.profile, [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height], delta));
      setMenu(null);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [connected, runtime, update]);
  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!connected || runtime.current.editing || (event.button !== 1 && !(event.button === 0 && tool === 'move'))) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { pointerId: event.pointerId, start: [event.clientX, event.clientY], frame: normalizeFraming(runtime.current.profile) };
    setEditing(true); setPanning(true); setMenu(null);
  };
  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    const current = pan.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    update(normalizeFraming({ ...current.frame, panX: current.frame.panX + (event.clientX - current.start[0]) / rect.width,
      panY: current.frame.panY + (event.clientY - current.start[1]) / rect.height }));
  };
  const finishPan = (event: PointerEvent<HTMLDivElement>) => {
    if (pan.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    pan.current = null; setEditing(false); setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const grid = displayedGrid(profile);
  const polygons = gridPolygons(grid);
  const changeGrid = (change: Partial<GridSettings>) => { setGrid({ ...grid, ...change, source: 'manual' }); setMenu(null); };
  const point = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  };
  const beginDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !connected) return;
    const target = event.target as Element;
    const handle = target.closest('[data-corner]');
    if (!handle && !target.closest('[data-grid]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setEditing(true);
    drag.current = { corner: handle ? Number(handle.getAttribute('data-corner')) : null, start: point(event), quad: grid.quad.map(p => [...p]) as Quad };
    setMenu(null);
  };
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current) return;
    const p = point(event);
    const quad = current.quad.map(p => [...p]) as Quad;
    if (current.corner !== null) quad[current.corner] = p;
    else {
      const base = quad.map(point => unframePoint(point, profile));
      const dx = profile.zoom * Math.max(-Math.min(...base.map(p => p[0])), Math.min(1 - Math.max(...base.map(p => p[0])), (p[0] - current.start[0]) / profile.zoom));
      const dy = profile.zoom * Math.max(-Math.min(...base.map(p => p[1])), Math.min(1 - Math.max(...base.map(p => p[1])), (p[1] - current.start[1]) / profile.zoom));
      quad.forEach(p => { p[0] += dx; p[1] += dy; });
    }
    if (validQuad(quad.map(point => unframePoint(point, profile)), .015 / (profile.zoom * profile.zoom))) changeGrid({ quad });
  };
  const finishDrag = () => { drag.current = null; setEditing(false); };
  const gridDirections = <>
    <button type="button" aria-label="영역 좌우 반전" onClick={() => changeGrid({ flipX: !grid.flipX })}><FlipHorizontal2 size={17} />좌우 반전</button>
    <button type="button" aria-label="영역 상하 반전" onClick={() => changeGrid({ flipY: !grid.flipY })}><FlipVertical2 size={17} />상하 반전</button>
    <button type="button" onClick={() => changeGrid({ turns: (grid.turns + 1) % 4 })}><RotateCw size={17} />90° 회전</button>
    <button type="button" onClick={() => changeGrid({ turns: (grid.turns + 2) % 4 })}><RotateCw size={17} />180° 회전</button>
  </>;
  return <div className="camera-settings-app" onClick={() => { if (menu) setMenu(null); }}>
    <WindowTitleBar title="카메라 설정 · Moti" />
    <header className="camera-settings-header"><div><h1>카메라 설정</h1><p>{getLearningMode(camera.modeId).title} <span>·</span> {camera.cameraLabel}</p></div></header>
    <main className="camera-settings-main">
      <section className="camera-preview-area" aria-label="카메라 설정 미리보기">
        <div ref={image} className={`camera-preview-image${panning ? ' is-panning' : ''}`} data-tool={tool} style={{ '--preview-ratio': ratio } as CSSProperties}
          onPointerDownCapture={beginPan} onPointerMoveCapture={movePan} onPointerUpCapture={finishPan} onPointerCancelCapture={finishPan} onLostPointerCapture={finishPan}
          onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}>
            <canvas ref={canvas} />
            {connected && camera.modeId === 'keyboard' && <svg viewBox={`0 0 1000 ${1000 / ratio}`} preserveAspectRatio="none" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
              onContextMenu={event => { event.preventDefault(); const child = event.currentTarget.ownerDocument.defaultView; setMenu({ x: Math.max(0, Math.min(event.clientX, (child?.innerWidth ?? 1000) - 190)), y: Math.max(0, Math.min(event.clientY, (child?.innerHeight ?? 700) - 210)) }); }} aria-label="키보드 영역 · 모서리와 내부를 드래그하세요">
              <polygon data-grid="true" points={grid.quad.map(p => `${p[0] * 1000},${p[1] * 1000 / ratio}`).join(' ')} fill="rgba(28,176,246,.1)" stroke="#1cb0f6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              {Object.entries(polygons).map(([name, p]) => <g key={name} data-grid="true"><polygon points={p.map(q => `${q[0] * 1000},${q[1] * 1000 / ratio}`).join(' ')} fill="transparent" stroke="rgba(125,211,252,.65)" strokeWidth="1" vectorEffect="non-scaling-stroke" /><text x={p.reduce((n, q) => n + q[0], 0) * 250} y={p.reduce((n, q) => n + q[1], 0) * 250 / ratio} textAnchor="middle" dominantBaseline="central" fill="white" stroke="#0f172a" strokeWidth="3" paintOrder="stroke" fontSize={Math.max(14, 10000 / Math.max(1, previewWidth))}>{name}</text></g>)}
              {grid.quad.map((p, i) => { const x = p[0] * 1000, y = p[1] * 1000 / ratio, size = 1000 / Math.max(1, previewWidth); return <g key={i} data-corner={i} className="camera-corner"><rect x={x - 20 * size} y={y - 20 * size} width={40 * size} height={40 * size} fill="transparent" /><path d={`M ${x + (i === 0 || i === 3 ? 15 : -15) * size} ${y} L ${x} ${y} L ${x} ${y + (i < 2 ? 15 : -15) * size}`} stroke="#1cb0f6" strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" /><rect x={x - 4 * size} y={y - 4 * size} width={8 * size} height={8 * size} fill="white" stroke="#1cb0f6" strokeWidth="2" vectorEffect="non-scaling-stroke" /></g>; })}
            </svg>}
          {!connected && <div className="camera-off"><CameraOff size={36} /><strong>카메라 꺼짐</strong><p>홈 또는 모니터링 화면에서 시작을 눌러 주세요.</p></div>}
        </div>
        {connected && <div className="camera-preview-toolbar" role="toolbar" aria-label="미리보기 보기 도구">
          {camera.modeId === 'keyboard' && <><button type="button" aria-label="영역 편집" aria-pressed={tool === 'edit'} title="키보드 영역과 모서리 편집" onClick={() => setTool('edit')}><MousePointer2 size={16} />영역 편집</button><button type="button" aria-label="화면 이동" aria-pressed={tool === 'move'} title="드래그로 이동 · 휠 버튼 드래그도 가능" onClick={() => setTool('move')}><Hand size={16} />이동</button></>}
          <output aria-label="카메라 확대율" title="영상 위에서 휠로 확대·축소">{Math.round(profile.zoom * 100)}%</output>
          <button type="button" aria-label="확대·이동 초기화" title="확대·이동 초기화" onClick={() => update({ zoom: 1, panX: 0, panY: 0 })}><Maximize size={16} /></button>
        </div>}
      </section>
      <aside className="camera-settings-controls">
        {selection}
        {camera.modeId === 'keyboard' && <section><h2><ScanLine size={18} />키보드 영역</h2><div className="camera-choice"><button aria-pressed={grid.source === 'automatic'} onClick={() => setGrid({ ...grid, source: 'automatic', flipX: false, flipY: false, turns: 0 })}>자동 인식</button><button aria-pressed={grid.source === 'manual'} onClick={() => changeGrid({})}>직접 맞추기</button></div><p className="camera-hint">{grid.source === 'manual' ? '네 모서리를 맞추고, 내부를 드래그해 이동하세요.' : '자동 인식이 어려우면 바로 직접 맞출 수 있어요.'}</p><h3>영역 방향</h3><div className="camera-button-grid">{gridDirections}</div><button className="camera-reset" onClick={() => changeGrid({ quad: defaultQuad(), flipX: false, flipY: false, turns: 0 })}><RotateCcw size={15} />영역 초기화</button></section>}
        <section><h2>영상 방향</h2><div className="camera-button-grid"><button aria-pressed={profile.flipX} onClick={() => update({ flipX: !profile.flipX })}><FlipHorizontal2 size={17} />좌우 반전</button><button aria-pressed={profile.flipY} onClick={() => update({ flipY: !profile.flipY })}><FlipVertical2 size={17} />상하 반전</button><button onClick={() => update({ angle: ((profile.angle + 270) % 360) - 180 })}><RotateCw size={17} />90° 회전</button><button onClick={() => update({ angle: ((profile.angle + 360) % 360) - 180 })}><RotateCw size={17} />180° 회전</button></div><Range label="기울기" value={profile.angle} min={-180} max={180} suffix="°" onChange={angle => update({ angle })} /></section>
        <section><h2>영상 조정</h2><Range label="밝기" value={profile.brightness} min={50} max={150} suffix="%" onChange={brightness => update({ brightness })} /><Range label="대비" value={profile.contrast} min={50} max={150} suffix="%" onChange={contrast => update({ contrast })} /><label className="camera-field">해상도<select value={profile.resolution} onChange={event => update({ resolution: Number(event.target.value) })}><option value={640}>640 · 가볍게</option><option value={1280}>1280 · 기본</option><option value={1920}>1920 · 선명하게</option></select></label>{settings.width && <p className="camera-hint">현재 영상 {settings.width} × {settings.height}</p>}<button className="camera-reset" onClick={() => update({ left: 0, top: 0, width: 1, height: 1, angle: 0, brightness: 100, contrast: 100, flipX: camera.modeId !== 'keyboard', flipY: false, zoom: 1, panX: 0, panY: 0 })}><RotateCcw size={15} />영상 조정 초기화</button></section>
        <section><h2>카메라 노출</h2>{!connected ? <p className="camera-hint">카메라 연결 후 지원 여부를 확인합니다.</p> : caps?.exposureMode?.length ? <><label className="camera-field">노출 방식<select value={profile.exposureMode || settings.exposureMode || caps.exposureMode[0]} onChange={event => update({ exposureMode: event.target.value })}>{caps.exposureMode.map(mode => <option key={mode} value={mode}>{mode === 'manual' ? '수동' : mode === 'continuous' ? '자동' : mode}</option>)}</select></label>{profile.exposureMode === 'manual' && caps.exposureTime && <Range label="노출 시간" value={profile.exposure ?? settings.exposureTime ?? caps.exposureTime.min} min={caps.exposureTime.min} max={caps.exposureTime.max} step={caps.exposureTime.step || 1} onChange={exposure => update({ exposure })} />}{settings.exposureTime !== undefined && <p className="camera-hint">현재 노출 시간 {settings.exposureTime}</p>}</> : <p className="camera-hint">이 카메라에서는 앱의 노출 조정을 지원하지 않습니다.</p>}</section>
        {camera.exposureError && <p role="alert" className="camera-error">설정 적용 오류: {camera.exposureError}</p>}
      </aside>
    </main>
    {menu && <div role="menu" className="camera-grid-menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}><strong>키보드 영역 방향</strong>{gridDirections}</div>}
  </div>;
}
function Range({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  const id = useId();
  return <label className="camera-range" htmlFor={id}><span>{label}<output htmlFor={id}>{value}{suffix}</output></span><input id={id} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}
