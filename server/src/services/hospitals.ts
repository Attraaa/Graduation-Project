import { HttpError } from '../http.js';

/** The departments the screen offers. Each one is the search word within Kakao's hospital category. */
export const DEPARTMENTS = ['정형외과', '재활의학과', '신경외과', '안과'] as const;
export type Department = typeof DEPARTMENTS[number];
export type Where = { query: string } | { lat: number; lng: number };

export interface Hospital {
  id: string; name: string; category: string; address: string; phone: string;
  /** Meters from the search center. */
  distance: number;
  lat: number; lng: number;
  /** The Kakao Map place page. */
  url: string;
}
export interface HospitalResult { center: { lat: number; lng: number; label: string }; hospitals: Hospital[] }
export type FindHospitals = (department: Department, where: Where) => Promise<HospitalResult>;

const API = 'https://dapi.kakao.com/v2/local/search';
const RADIUS_M = 5000;
const SIZE = 15;

interface KakaoDocument {
  id?: string; place_name?: string; category_name?: string; address_name?: string; road_address_name?: string;
  phone?: string; distance?: string; place_url?: string; x: string; y: string;
}

/** About 1 km: a device location is never searched or returned more precisely than this. */
export const roughly = (value: number) => Math.round(value * 100) / 100;

/**
 * 주변 병원 찾기. 카카오 로컬 API로 입력한 위치(주소, 없으면 장소 이름)나 기기 위치 근처의 병원을 거리순으로 찾습니다.
 * 위치는 저장하거나 로그에 남기지 않습니다. 병원 목록은 검색 결과일 뿐 추천이 아닙니다.
 */
export function createKakaoHospitalSearch(apiKey: string, fetcher: typeof fetch = fetch): FindHospitals {
  const search = async (path: 'address' | 'keyword', params: Record<string, string>) => {
    let response: Response;
    try {
      response = await fetcher(`${API}/${path}.json?${new URLSearchParams(params)}`, {
        headers: { Authorization: `KakaoAK ${apiKey}` }, signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new HttpError(504, '지도 검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    if (!response.ok) {
      // Only the status is logged: the request carries the place the user typed or where they are.
      console.error('Kakao local search failed:', response.status);
      if (response.status === 401 || response.status === 403) {
        throw new HttpError(503, '주변 병원 찾기를 사용할 수 없어요. 서버의 KAKAO_REST_API_KEY와 카카오맵 사용 설정을 확인해 주세요.');
      }
      if (response.status === 429) throw new HttpError(429, '병원 찾기 요청이 많아요. 잠시 후 다시 시도해 주세요.');
      throw new HttpError(502, '주변 병원을 찾지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    const body = await response.json() as { documents?: KakaoDocument[] };
    return Array.isArray(body.documents) ? body.documents : [];
  };

  // An address is looked up as an address first; a place name such as "강남역" falls back to the keyword search.
  const locate = async (query: string) => {
    const [address] = await search('address', { query, size: '1' });
    if (address) return { lat: Number(address.y), lng: Number(address.x), label: address.address_name ?? query };
    const [place] = await search('keyword', { query, size: '1' });
    if (place) return { lat: Number(place.y), lng: Number(place.x), label: place.place_name ?? query };
    throw new HttpError(404, '입력한 위치를 찾지 못했어요. 동네 이름이나 주소를 다시 입력해 주세요.');
  };

  return async (department, where) => {
    const center = 'query' in where ? await locate(where.query) : { lat: roughly(where.lat), lng: roughly(where.lng), label: '현재 위치 근처' };
    const documents = await search('keyword', {
      query: department, category_group_code: 'HP8', x: String(center.lng), y: String(center.lat),
      radius: String(RADIUS_M), sort: 'distance', size: String(SIZE),
    });
    return {
      center,
      hospitals: documents.map(place => ({
        id: place.id ?? '',
        name: place.place_name ?? '',
        category: place.category_name?.split('>').at(-1)?.trim() ?? '',
        address: place.road_address_name || place.address_name || '',
        phone: place.phone ?? '',
        distance: Number(place.distance ?? 0),
        lat: Number(place.y),
        lng: Number(place.x),
        url: (place.place_url ?? '').replace(/^http:/, 'https:'),
      })),
    };
  };
}
