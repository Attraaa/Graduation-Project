import { apiRequest } from '../../utils/apiClient';

/** Same list as server/src/services/hospitals.ts DEPARTMENTS: the server refuses any other. */
export const DEPARTMENTS = ['정형외과', '재활의학과', '신경외과', '안과'] as const;
export type Department = typeof DEPARTMENTS[number];
export type Where = { query: string } | { lat: number; lng: number };

export interface Hospital {
  id: string; name: string; category: string; address: string; phone: string;
  distance: number; lat: number; lng: number; url: string;
}
export interface HospitalResult { center: { lat: number; lng: number; label: string }; hospitals: Hospital[] }

/** About 1 km. The device location leaves the device no more precisely than this; the server rounds it again. */
const roughly = (value: number) => Math.round(value * 100) / 100;

/** Hospitals of one department near a typed place or the device location, nearest first (GET /api/hospitals). */
export function findHospitals(department: Department, where: Where) {
  const params = new URLSearchParams({ department });
  if ('query' in where) params.set('query', where.query.trim());
  else {
    params.set('lat', String(roughly(where.lat)));
    params.set('lng', String(roughly(where.lng)));
  }
  return apiRequest<HospitalResult>(`/api/hospitals?${params}`);
}

export const distanceText = (meters: number) => (meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`);
