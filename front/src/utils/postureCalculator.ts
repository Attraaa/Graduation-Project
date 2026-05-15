/**
 * 랜드마크의 좌표 정보를 나타내는 타입 (MediaPipe Landmark 구조체와 호환)
 */
interface Landmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }
  
  /**
   * 두 점퍼 사이의 각도를 계산합니다. (수평선 기준)
   */
  export const calculateAngle = (p1: Landmark, p2: Landmark): number => {
    if (!p1 || !p2) return 0;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    // 라디안을 디그리로 변환
    return Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  };
  
  /**
   * 귀와 어깨 좌표를 이용해 거북목 각도를 계산합니다.
   * @param ear 귀 좌표
   * @param shoulder 어깨 좌표
   * @returns 수직 대비 앞으로 기울어진 각도
   */
  export const calculateNeckAngle = (ear: Landmark, shoulder: Landmark): number => {
    if (!ear || !shoulder) return 0;
    
    // 어깨(shoulder)를 원점으로 했을 때 귀(ear)의 상대 위치
    const dx = ear.x - shoulder.x;
    // Y축은 아래로 갈수록 커집니다. 수직 위쪽 방향의 각도를 재기 위해 반전합니다.
    const dy = shoulder.y - ear.y; 
    
    // 수직선(0도)을 기준으로 귀가 얼마나 벗어났는지 각도 계산
    const angle = Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
    return angle;
  };
  
  /**
   * 양 어깨의 높이 차이를 계산하여 비대칭 여부를 확인합니다.
   * @param leftShoulder 왼쪽 어깨 좌표
   * @param rightShoulder 오른쪽 어깨 좌표
   * @param threshold 허용 임계값 (기본값: 0.05)
   * @returns 대칭이면 true, 비대칭이면 false
   */
  export const calculateShoulderSymmetry = (
    leftShoulder: Landmark, 
    rightShoulder: Landmark, 
    threshold: number = 0.05
  ): boolean => {
    if (!leftShoulder || !rightShoulder) return true;
    
    // 0~1 사이의 정규화된 y좌표 차이
    const diff = Math.abs(leftShoulder.y - rightShoulder.y);
    return diff < threshold;
  };
  