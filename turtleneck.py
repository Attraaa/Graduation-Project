import cv2
import mediapipe as mp
import math

def get_distance(x1, y1, x2, y2):
    return math.hypot(x2 - x1, y2 - y1)

def clamp(value, min_val=0, max_val=100):
    return max(min_val, min(value, max_val))

def calculate_posture_score(init_data, cur_data):
    # 척도 1: 목 하강 (비중 50%) 이 아래부터 로직부분
    ratio_neck = cur_data['H'] / (1.0 * init_data['H'])
    S_neck = clamp(ratio_neck * 100)
    
    # 척도 2: 모니터 거리 (비중 30%)
    R_dist = cur_data['D'] / init_data['D']
    if R_dist <= 1.03: S_dist = 100.0
    elif R_dist >= 1.40: S_dist = 0.0
    else: S_dist = 100 - ((R_dist - 1.03) / (1.40 - 1.03) * 100)
    S_dist = clamp(S_dist)
    
    # 척도 3: 어깨 말림 (비중 20%)
    R_shoulder = cur_data['W'] / init_data['W']
    if R_shoulder >= 1.0: S_shoulder = 100.0
    elif R_shoulder <= 0.95: S_shoulder = 0.0
    else: S_shoulder = ((R_shoulder - 0.95) / (1.0 - 0.95)) * 100
    S_shoulder = clamp(S_shoulder)
    
    S_total = (0.5 * S_neck) + (0.3 * S_dist) + (0.2 * S_shoulder)
    return round(S_total, 1)


mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

cap = cv2.VideoCapture(0)

init_data = None
total_active_frames = 0  
good_posture_frames = 0  
bad_posture_streak = 0   

print("프로그램을 시작합니다. 카메라 창을 클릭해 주세요.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break

    frame = cv2.flip(frame, 1)
    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(image_rgb)

    if results.pose_landmarks:
        mp_drawing.draw_landmarks(frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)
        
        landmarks = results.pose_landmarks.landmark
        
        nose = landmarks[mp_pose.PoseLandmark.NOSE]
        l_eye = landmarks[mp_pose.PoseLandmark.LEFT_EYE]
        r_eye = landmarks[mp_pose.PoseLandmark.RIGHT_EYE]
        l_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER]
        r_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER]

        current_H = ((l_shoulder.y + r_shoulder.y) / 2) - nose.y
        current_D = get_distance(l_eye.x, l_eye.y, r_eye.x, r_eye.y)
        current_W = get_distance(l_shoulder.x, l_shoulder.y, r_shoulder.x, r_shoulder.y)

        # 사용자 정자세 최초 1회 캘리브레이션 모드
        if init_data is None:
            cv2.putText(frame, "Straighten your back and press 'c'", (20, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            
            # c 키 누르면 현재 좌표를 기준값으로 저장
            if cv2.waitKey(1) & 0xFF == ord('c'):
                init_data = {'H': current_H, 'D': current_D, 'W': current_W}
                print("✅ 캘리브레이션 완료! 자세 측정을 시작합니다.")

        else:
            cur_data = {'H': current_H, 'D': current_D, 'W': current_W}
            
            score = calculate_posture_score(init_data, cur_data)
            total_active_frames += 1
            
            if score >= 70.0:
                good_posture_frames += 1
                bad_posture_streak = 0
                color = (0, 255, 0) 
            else:
                bad_posture_streak += 1
                color = (0, 0, 255) 

            cv2.putText(frame, f"Score: {score}", (20, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
            
            # 실시간 경고 알림 (예: 약 3초 연속 불량일 때 화면에 경고)
            if bad_posture_streak >= 90: # 30fps 기준 90프레임
                cv2.putText(frame, "WARNING: Bad Posture!", (20, 100), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3)

    cv2.imshow('Turtle Neck Corrector', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

print("\n자세 평가 리포트")
if total_active_frames > 0:
    maintenance_rate = (good_posture_frames / total_active_frames) * 100
    print(f"총 측정 프레임: {total_active_frames} F")
    print(f"바른 자세 유지: {good_posture_frames} F")
    print(f"최종 바른 자세 유지율: {maintenance_rate:.1f}%")
else:
    print("측정된 데이터가 없습니다. (캘리브레이션을 안 했거나 바로 종료함)")