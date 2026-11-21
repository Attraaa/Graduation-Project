import { Router } from 'express';
import type { Auth } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import { DEPARTMENTS, type FindHospitals } from '../services/hospitals.js';
import { choice, text } from '../validation.js';

/** Query values arrive as text. Coordinates outside roughly the Korean peninsula are refused. */
function coordinate(value: unknown, name: string, min: number, max: number) {
  const number = typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < min || number > max) throw new HttpError(400, `${name}가 올바르지 않아요.`);
  return number;
}

/**
 * 주변 병원 찾기. find가 없으면(서버에 KAKAO_REST_API_KEY 없음) 503으로 알려 줍니다.
 * 위치는 이 요청에만 쓰고 저장하지 않습니다.
 */
export function createHospitalsRouter(find: FindHospitals | null, auth: Auth) {
  const router = Router();
  router.use(auth.requireAuth);

  router.get('/', asyncHandler(async (req, res) => {
    if (!find) throw new HttpError(503, '주변 병원 찾기가 아직 설정되지 않았어요. 서버의 server/.env에 KAKAO_REST_API_KEY를 넣어 주세요.');
    const department = choice(req.query.department, '진료과', DEPARTMENTS);
    const where = req.query.query !== undefined
      ? { query: text(req.query.query, '위치', 100) }
      : req.query.lat !== undefined || req.query.lng !== undefined
        ? { lat: coordinate(req.query.lat, '위도', 33, 39), lng: coordinate(req.query.lng, '경도', 124, 132) }
        : null;
    if (!where) throw new HttpError(400, '동네 이름이나 주소를 입력하거나 현재 위치를 사용해 주세요.');
    res.json(await find(department, where));
  }));

  return router;
}
