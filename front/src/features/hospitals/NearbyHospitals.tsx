import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Hospital as HospitalIcon, LocateFixed, Search } from 'lucide-react';
import { BUTTON, BUTTON_STRONG, INPUT } from '../settings/parts';
import { CARD } from '../statistics/parts';
import { DEPARTMENTS, distanceText, findHospitals, type Department, type HospitalResult, type Where } from './api';
import { loadKakaoMaps, type InfoWindow, type KakaoMap, type LatLng, type Marker } from './kakaoMap';

type Pin = { id: string; name: string; marker: Marker; position: LatLng };
type View = { box: HTMLElement; map: KakaoMap; info: InfoWindow; pins: Pin[]; fit: () => void };

/** The selected hospital's name above its marker, as text so a place name can never inject markup. */
function label(name: string) {
  const element = document.createElement('div');
  element.style.cssText = 'padding:4px 8px;font-size:12px;font-weight:600;color:#1f2937;white-space:nowrap';
  element.textContent = name;
  return element;
}

/**
 * 주변 병원 찾기. 진료과와 동네·주소(또는 현재 위치)로 카카오 지도 검색 결과를 지도와 목록으로 보여 줍니다.
 * 점수나 총평과 연결하지 않으며, 결과는 추천이 아닌 검색 결과입니다.
 */
export default function NearbyHospitals() {
  const [department, setDepartment] = useState<Department>(DEPARTMENTS[0]);
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState<Where | null>(null);
  const [result, setResult] = useState<HospitalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [mapError, setMapError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const latest = useRef(0);
  const mapBox = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const shown = result !== null;

  // Only the latest search may show its result, so a slow earlier answer cannot replace a newer one.
  const search = async (next: Where, nextDepartment = department) => {
    const id = ++latest.current;
    setWhere(next);
    setBusy(true);
    setMessage('');
    setSelected(null);
    try {
      const found = await findHospitals(nextDepartment, next);
      if (id === latest.current) setResult(found);
    } catch (error) {
      if (id === latest.current) setMessage(error instanceof Error ? error.message : '주변 병원을 찾지 못했어요.');
    } finally {
      if (id === latest.current) setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) void search({ query });
    else setMessage('동네 이름이나 주소를 입력해 주세요.');
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setMessage('이 기기에서는 현재 위치를 쓸 수 없어요. 동네 이름이나 주소로 찾아 주세요.');
      return;
    }
    setBusy(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      position => void search({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {
        setBusy(false);
        setMessage('현재 위치를 가져오지 못했어요. 동네 이름이나 주소로 찾아 주세요.');
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const choose = (next: Department) => {
    setDepartment(next);
    if (where) void search(where, next);
  };

  // A new result replaces the markers; the map itself is made once per container.
  useEffect(() => {
    const box = mapBox.current;
    if (!result || !box) return;
    let active = true;
    loadKakaoMaps().then(maps => {
      if (!active) return;
      const center = new maps.LatLng(result.center.lat, result.center.lng);
      if (view.current?.box !== box) {
        view.current = { box, map: new maps.Map(box, { center, level: 5 }), info: new maps.InfoWindow({ content: label('') }), pins: [], fit: () => {} };
      }
      const current = view.current;
      current.info.close();
      current.pins.forEach(pin => pin.marker.setMap(null));
      const bounds = new maps.LatLngBounds();
      bounds.extend(center);
      current.pins = result.hospitals.map(hospital => {
        const position = new maps.LatLng(hospital.lat, hospital.lng);
        const marker = new maps.Marker({ map: current.map, position, title: hospital.name });
        maps.event.addListener(marker, 'click', () => setSelected(hospital.id));
        bounds.extend(position);
        return { id: hospital.id, name: hospital.name, marker, position };
      });
      current.fit = () => (current.pins.length ? current.map.setBounds(bounds) : current.map.setCenter(center));
      current.fit();
      setMapError('');
    }, (error: unknown) => {
      if (active) setMapError(error instanceof Error ? error.message : '지도를 불러오지 못했어요.');
    });
    return () => { active = false; };
  }, [result]);

  // A window resize changes the box: lay the map out again and show the same hospitals.
  useEffect(() => {
    const box = mapBox.current;
    if (!shown || !box) return;
    const observer = new ResizeObserver(() => {
      if (view.current?.box !== box) return;
      view.current.map.relayout();
      view.current.fit();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [shown]);

  useEffect(() => {
    const current = view.current;
    const pin = current?.pins.find(item => item.id === selected);
    if (!current || !pin) return;
    current.info.setContent(label(pin.name));
    current.info.open(current.map, pin.marker);
    current.map.panTo(pin.position);
  }, [selected]);

  return (
    <section aria-label="주변 병원 찾기" className={`${CARD} space-y-4`}>
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-bold text-heading"><HospitalIcon aria-hidden="true" size={18} />주변 병원 찾기</h2>
        <p className="text-sm text-heading">불편감이나 통증이 계속되면 전문의와 상담하세요.</p>
        <p className="text-xs text-muted">카카오 지도에서 찾은 병원을 거리순으로 보여 줘요. 추천이나 진료 판단이 아니에요.</p>
      </div>

      <div role="group" aria-label="진료과" className="flex flex-wrap gap-2">
        {DEPARTMENTS.map(item => (
          <button key={item} type="button" aria-pressed={department === item} disabled={busy} onClick={() => choose(item)}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${department === item ? 'border-heading bg-heading text-surface' : 'border-border text-heading'}`}>
            {item}
          </button>
        ))}
      </div>

      {/* On a narrow window the place box takes the whole first row and the two buttons share the second. */}
      <form onSubmit={submit} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input aria-label="동네 이름이나 주소" placeholder="예: 강남역, 분당구 정자동" maxLength={100} value={query}
          onChange={event => setQuery(event.target.value)} className={`${INPUT} col-span-2 sm:col-span-1`} />
        <button type="submit" disabled={busy} className={BUTTON_STRONG}><Search aria-hidden="true" size={16} />찾기</button>
        <button type="button" disabled={busy} onClick={locate} className={BUTTON}><LocateFixed aria-hidden="true" size={16} />현재 위치</button>
      </form>
      <p className="text-xs text-muted">입력한 위치와 현재 위치는 이번 검색에만 쓰고 저장하지 않아요. 현재 위치는 약 1km 단위로만 보내요.</p>

      {busy && <p aria-live="polite" className="text-sm text-muted">주변 병원을 찾고 있어요…</p>}
      {message && <p role="alert" className="text-sm font-semibold text-danger">{message}</p>}

      {result && (
        <div className="space-y-3">
          <p className="text-xs text-muted">{`${result.center.label} 기준 · 반경 5km`}</p>
          <div ref={mapBox} aria-label="병원 위치 지도" className="h-72 w-full overflow-hidden rounded-xl border border-border bg-surface-muted" />
          {mapError && <p className="text-xs text-muted">{mapError}</p>}
          {result.hospitals.length ? (
            <ul className="divide-y divide-border">
              {result.hospitals.map(hospital => (
                <li key={hospital.id} className={`flex flex-wrap items-start justify-between gap-2 py-3 ${selected === hospital.id ? 'bg-nav-active' : ''}`}>
                  <button type="button" onClick={() => setSelected(hospital.id)} className="min-w-0 flex-1 text-left">
                    <span className="block font-semibold text-heading">{hospital.name}</span>
                    <span className="block text-xs text-muted">{`${hospital.category} · ${distanceText(hospital.distance)}`}</span>
                    <span className="block text-xs text-muted">
                      {hospital.address}
                      {hospital.address && hospital.phone && ' · '}
                      {hospital.phone && <span className="whitespace-nowrap">{hospital.phone}</span>}
                    </span>
                  </button>
                  {hospital.url && (
                    <a href={hospital.url} target="_blank" rel="noreferrer" className={`${BUTTON} h-8 px-3 text-xs`}>
                      <ExternalLink aria-hidden="true" size={14} />카카오맵에서 보기
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{`반경 5km 안에서 ${department}를 찾지 못했어요.`}</p>}
        </div>
      )}
    </section>
  );
}
