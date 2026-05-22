import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';
import { ShieldCheck, TrendingUp, AlertTriangle, Sparkles } from 'lucide-react';

const mockData = [
  { time: '09:00', score: 95 },
  { time: '10:00', score: 88 },
  { time: '11:00', score: 82 },
  { time: '12:00', score: 75 },
  { time: '13:00', score: 90 }, // 점심 휴식 후 회복
  { time: '14:00', score: 85 },
  { time: '15:00', score: 78 },
  { time: '16:00', score: 70 },
  { time: '17:00', score: 65 }, // 퇴근 전 피로도 누적
];

const diseaseRiskData = [
  { name: '거북목 증후군', risk: 75, fill: '#ff4b4b' },
  { name: '손목터널 증후군', risk: 40, fill: '#1cb0f6' },
  { name: '안구건조증', risk: 60, fill: '#ffc800' },
  { name: '어깨 비대칭', risk: 30, fill: '#58cc02' },
];

const Statistics = () => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-gray-700">나의 자세 통계</h1>
        <p className="text-gray-500 font-bold mt-2">시간대별 자세 점수와 AI가 분석한 예상 질환 위험도를 확인하세요.</p>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-duo flex flex-col items-center justify-center py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 mb-4">
            <ShieldCheck size={32} className="text-[#58cc02]" />
          </div>
          <h2 className="text-4xl font-black text-gray-700">82점</h2>
          <p className="text-gray-500 font-bold mt-1">오늘의 평균 자세 점수</p>
        </div>

        <div className="card-duo flex flex-col items-center justify-center py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 mb-4">
            <TrendingUp size={32} className="text-[#1cb0f6]" />
          </div>
          <h2 className="text-4xl font-black text-gray-700">+12%</h2>
          <p className="text-gray-500 font-bold mt-1">어제 대비 개선도</p>
        </div>

        <div className="card-duo flex flex-col items-center justify-center py-8 bg-red-50 border-red-200">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 mb-4">
            <AlertTriangle size={32} className="text-[#ff4b4b]" />
          </div>
          <h2 className="text-2xl font-black text-gray-700 text-center">거북목<br/>주의보</h2>
          <p className="text-red-500 font-bold mt-1">오후 4시 이후 급격히 악화</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Line Chart */}
        <div className="card-duo">
          <h3 className="text-xl font-black text-gray-700 mb-6">시간대별 자세 점수 변화</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontWeight: 'bold'}} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontWeight: 'bold'}} />
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: '2px solid #e5e7eb', fontWeight: 'bold'}}
                />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  stroke="#1cb0f6" 
                  strokeWidth={4} 
                  dot={{ r: 6, fill: '#1cb0f6', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart - Disease Risk */}
        <div className="card-duo">
          <h3 className="text-xl font-black text-gray-700 mb-6">AI 분석: 예상 VDT 질환 위험도</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={diseaseRiskData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#4b5563', fontWeight: 'bold', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '16px', border: '2px solid #e5e7eb', fontWeight: 'bold'}} />
                <Bar dataKey="risk" radius={[0, 8, 8, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Feedback */}
      <div className="card-duo border-green-200 bg-white">
        <h3 className="mb-2 flex items-center text-xl font-black text-gray-700">
          <Sparkles className="mr-2 text-[#26c281]" />
          AI 맞춤형 피드백 및 의학 정보
        </h3>
        <p className="mb-4 font-bold leading-7 text-gray-600">
          누적된 자세 데이터를 분석한 결과, 오후 시간대에 목 각도가 평균 15도 이상 앞으로 쏠리는 현상이 관찰되었습니다. 이는 전형적인 거북목 증후군의 전조 증상입니다.
        </p>
        <div className="rounded-2xl border-2 border-green-100 bg-green-50 p-4">
          <h4 className="mb-2 font-black text-gray-700">오늘의 추천 스트레칭</h4>
          <ul className="list-disc list-inside space-y-1 font-bold leading-7 text-gray-600">
            <li>턱 당기기(Chin Tuck) 스트레칭: 10초 유지 x 5회 반복</li>
            <li>양팔을 뒤로 깍지 끼고 가슴 펴기: 15초 유지</li>
            <li>모니터 상단을 눈높이에 맞추어 시선이 15도 아래를 향하도록 작업 환경 개선 권장</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
