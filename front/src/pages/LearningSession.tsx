import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Minimize2, Play, Square } from 'lucide-react';
import Button from '../components/Button';
import PostureMonitor from '../components/PostureMonitor';
import { getLearningMode } from '../data/modes';
import { useDialog } from '../components/AppDialog';

const LearningSession = () => {
  const { modeId } = useParams();
  const navigate = useNavigate();
  const { notify } = useDialog();
  const mode = getLearningMode(modeId);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [score, setScore] = useState(100);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
      setScore((value) => Math.max(58, value - (Math.random() > 0.65 ? 1 : 0)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const handleToggle = () => {
    setIsRunning((prev) => {
      const next = !prev;
      if (next) {
        setElapsed(0);
        setScore(100);
      }
      return next;
    });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isGoodPosture = score >= 80;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="shrink-0">
        <div className="flex items-start justify-between gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="mb-2 flex items-center font-bold text-gray-500 transition hover:text-gray-700"
          >
            <ArrowLeft size={18} className="mr-1" /> 뒤로가기
          </button>
          <label className="flex min-w-[260px] items-center justify-end gap-3">
            <span className="shrink-0 text-sm font-bold text-gray-500">캠 설정</span>
            <select className="w-44 rounded-2xl border-2 border-gray-200 bg-white px-4 py-2 font-bold text-gray-700 outline-none">
              <option>기본 웹캠</option>
              <option>외장 카메라</option>
            </select>
          </label>
        </div>
        <div className="mt-2">
          <h1 className="text-2xl font-black text-gray-700">{mode.title} 학습</h1>
          <p className="mt-1 font-bold text-gray-500">웹캠을 확인한 뒤 자세교정을 시작하세요.</p>
        </div>
      </header>

      <div className="card-duo flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="shrink-0 border-b-2 border-gray-100 p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${mode.bgClass} text-white`}>
                {mode.icon}
              </div>
              <div className="min-w-0">
                <p className="whitespace-nowrap font-black text-gray-700">웹캠 확인 화면</p>
                <p className="whitespace-nowrap text-xs font-bold text-gray-500">캠 설정, 관절 표시, 실행 상태를 한 곳에서 확인합니다.</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center text-sm font-bold text-[#58cc02]">
              <div className="relative mr-2 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#58cc02] opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#58cc02]"></span>
              </div>
              <Camera size={16} className="mr-1 animate-pulse" />
              {isRunning ? `AI 카메라 분석 중 (${mode.id})` : `카메라 미리보기 (${mode.id})`}
            </div>
          </div>

          <div className="mt-3 flex w-full items-center gap-2 whitespace-nowrap">
            <div className="flex h-10 w-[102px] shrink-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-100 bg-gray-50 px-2">
              <span className="text-xs font-bold text-gray-500">시간</span>
              <span className="font-black text-gray-700">{formatTime(elapsed)}</span>
            </div>
            <div className="flex h-10 w-[92px] shrink-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-100 bg-gray-50 px-2">
              <span className="text-xs font-bold text-gray-500">점수</span>
              <span className={`font-black ${mode.textClass}`}>{score}점</span>
            </div>
            <div className="flex h-10 w-[214px] shrink-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-100 bg-gray-50 px-2">
              <span className="text-xs font-bold text-gray-500">현재 상태</span>
              <span className={`min-w-[106px] text-center font-black ${isGoodPosture ? 'text-green-600' : 'text-red-500'}`}>
                {isGoodPosture ? '바른 자세 유지 중' : '자세 확인 필요'}
              </span>
            </div>
            <Button type="button" variant={isRunning ? 'danger' : 'primary'} className="h-10 w-[148px] shrink-0 whitespace-nowrap px-3 py-2 text-sm" onClick={handleToggle}>
              {isRunning ? <Square size={16} className="mr-2 inline" /> : <Play size={16} className="mr-2 inline" />}
              {isRunning ? '자세교정 중지' : '자세교정 시작'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-[98px] shrink-0 whitespace-nowrap px-3 py-2 text-sm"
              onClick={() => void notify({
                title: '트레이 이동',
                message: '트레이로 이동했습니다.\n실제 앱에서는 시스템 트레이로 최소화됩니다.',
                tone: 'info',
              })}
            >
              <Minimize2 size={16} className="mr-2 inline" />
              트레이
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <PostureMonitor mode={mode.id} isRunning={isRunning} />
        </div>
      </div>
    </div>
  );
};

export default LearningSession;
