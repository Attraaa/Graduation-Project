import { useEffect, useState, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useWebcam } from '../hooks/useWebcam';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { calculateNeckAngle } from '../utils/postureCalculator';

interface PostureMonitorProps {
  mode: string;
  isRunning?: boolean;
}

const PostureMonitor = ({ mode, isRunning = true }: PostureMonitorProps) => {
  const [postureStatus, setPostureStatus] = useState<'GOOD' | 'WARNING'>('GOOD');
  
  const statsRef = useRef({ totalFrames: 0, badFrames: 0, lastUpdateTime: 0 });
  const { videoRef, startWebcam, stopWebcam, webcamError } = useWebcam();
  const { canvasRef, initMediaPipe, startProcessing, stopProcessing, aiError, isLoaded } = useMediaPipe();

  useEffect(() => {
    const setup = async () => {
      // 1. 카메라 시작
      const stream = await startWebcam();
      if (!stream) return;
      if (!isRunning) return;

      // 2. MediaPipe 초기화 및 뼈대 그리기 로직 설정
      const pose = await initMediaPipe((results: any) => {
        if (!canvasRef.current) return;
        const canvasCtx = canvasRef.current.getContext('2d');
        if (!canvasCtx) return;

        const POSE_CONNECTIONS = (window as any).POSE_CONNECTIONS;
        const drawConnectors = (window as any).drawConnectors;
        const drawLandmarks = (window as any).drawLandmarks;

        if (videoRef.current && canvasRef.current.width !== videoRef.current.videoWidth) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
        }

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        if (results.poseLandmarks) {
          // 상태에 따라 선 색상 변경 (정상: 초록, 경고: 빨강)
          const isBadNow = statsRef.current.totalFrames > 0 && 
                          ((statsRef.current.badFrames / statsRef.current.totalFrames) > 0.5 || postureStatus === 'WARNING');
          
          const lineColor = isBadNow ? '#FF0000' : '#00FF00';

          // [사용자 요청] 불필요한 얼굴 쪽 미디어파이프(안면 그물망) 제거하고 필요한 뼈대만 직접 그리기
          const drawLine = (p1: any, p2: any) => {
            if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
              canvasCtx.beginPath();
              canvasCtx.moveTo(p1.x * canvasRef.current!.width, p1.y * canvasRef.current!.height);
              canvasCtx.lineTo(p2.x * canvasRef.current!.width, p2.y * canvasRef.current!.height);
              canvasCtx.strokeStyle = lineColor;
              canvasCtx.lineWidth = 4;
              canvasCtx.stroke();
            }
          };

          const drawPoint = (p: any) => {
            if (p && p.visibility > 0.5) {
              canvasCtx.beginPath();
              canvasCtx.arc(p.x * canvasRef.current!.width, p.y * canvasRef.current!.height, 5, 0, 2 * Math.PI);
              canvasCtx.fillStyle = '#FFFFFF';
              canvasCtx.fill();
            }
          };

          const landmarks = results.poseLandmarks;
          
          // 거북목 모드일 때 그릴 뼈대 (귀, 어깨)
          if (mode === 'turtle' || mode === 'shoulder') {
            // 어깨선 (좌측 11번, 우측 12번)
            drawLine(landmarks[11], landmarks[12]);
            // 귀와 어깨 연결선 (목뼈 대용) (좌측 귀 7번, 우측 귀 8번)
            drawLine(landmarks[11], landmarks[7]);
            drawLine(landmarks[12], landmarks[8]);
            
            // 점 찍기
            drawPoint(landmarks[11]); drawPoint(landmarks[12]);
            drawPoint(landmarks[7]); drawPoint(landmarks[8]);
          } else {
            // 기본 뼈대 (기존 라이브러리 사용)
            if (drawConnectors && drawLandmarks) {
               drawConnectors(canvasCtx, landmarks, POSE_CONNECTIONS, {color: lineColor, lineWidth: 4});
               drawLandmarks(canvasCtx, landmarks, {color: '#FFFFFF', lineWidth: 2});
            }
          }
          
          if (mode === 'turtle') {
            const leftEar = results.poseLandmarks[7];
            const leftShoulder = results.poseLandmarks[11];
            const rightEar = results.poseLandmarks[8];
            const rightShoulder = results.poseLandmarks[12];

            if (leftEar && leftShoulder && rightEar && rightShoulder) {
              // 양쪽의 각도 평균을 구함
              const leftAngle = calculateNeckAngle(leftEar, leftShoulder);
              const rightAngle = calculateNeckAngle(rightEar, rightShoulder);
              
              // 화면 정면보다는 측면으로 살짝 돌렸을 때 가장 정확합니다.
              // 값이 가시성을 가질 때만 평균 계산
              let avgAngle = 0;
              if (leftEar.visibility > 0.7 && rightEar.visibility > 0.7) {
                avgAngle = (leftAngle + rightAngle) / 2;
              } else if (leftEar.visibility > 0.7) {
                avgAngle = leftAngle;
              } else if (rightEar.visibility > 0.7) {
                avgAngle = rightAngle;
              }

              // 임계값 (거북목 판별 기준 각도)
              const isTurtleNeck = avgAngle > 15; // 각도 기준을 약간 타이트하게(민감하게) 조정

              statsRef.current.totalFrames += 1;
              if (isTurtleNeck) {
                statsRef.current.badFrames += 1;
              }

              // 0.5초마다 UI 상태 업데이트
              const now = Date.now();
              if (now - statsRef.current.lastUpdateTime > 500) {
                statsRef.current.lastUpdateTime = now;
                // 최근 0.5초 동안 불량 프레임이 절반 이상이면 경고
                setPostureStatus(isTurtleNeck ? 'WARNING' : 'GOOD');
                
                // 프레임 카운트 초기화 (다음 0.5초 계산을 위해)
                statsRef.current.totalFrames = 0;
                statsRef.current.badFrames = 0;
              }
            }
          }
        }
        canvasCtx.restore();
      });

      // 3. 비디오 준비 완료 시 프레임 처리 루프 시작
      if (pose && videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(e => console.error("Play error:", e));
            startProcessing(videoRef.current);
          }
        };
      }
    };

    setup();

    return () => {
      stopProcessing();
      stopWebcam();
    };
  }, [startWebcam, initMediaPipe, startProcessing, stopProcessing, stopWebcam, mode, isRunning]);

  const errorMsg = webcamError || aiError;

  return (
    <div className="flex h-full min-h-0 flex-col border-t-2 border-gray-100 bg-gray-50">
      {errorMsg ? (
        <div className="bg-red-50 border-2 border-red-200 p-4 m-4 rounded-2xl flex items-start">
          <AlertCircle size={24} className="text-red-500 mr-3 mt-0.5" />
          <div>
            <h3 className="text-red-700 font-bold">카메라/AI 로딩 오류</h3>
            <p className="text-red-600 text-sm mt-1">{errorMsg}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            <video 
              ref={videoRef}
              autoPlay 
              playsInline 
              muted 
              className="absolute inset-0 h-full w-full object-cover transform scale-x-[-1]"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full object-cover pointer-events-none transform scale-x-[-1]"
            />
            {!isRunning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white font-bold z-10">
                자세교정 시작 버튼을 누르면 AI 분석이 시작됩니다.
              </div>
            )}
            {isRunning && !isLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white font-bold z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                AI 모델 로딩 중...
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PostureMonitor;
