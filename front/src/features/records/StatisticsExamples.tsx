import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Sparkles } from 'lucide-react';
const examples = [
  { name: '거북목 증후군', risk: 75, fill: '#ff4b4b' }, { name: '손목터널 증후군', risk: 40, fill: '#1cb0f6' },
  { name: '안구건조증', risk: 60, fill: '#ffc800' }, { name: '어깨 비대칭', risk: 30, fill: '#58cc02' },
];
export default function StatisticsExamples() {
  return <aside className="space-y-5" aria-label="AI 및 의학 정보 예시">
    <p className="rounded-xl bg-surface-muted p-4 font-bold text-muted">아래는 기존 화면의 예시입니다. 실제 측정 데이터와 연결되지 않았으며 개인의 건강 상태를 분석한 결과가 아닙니다.</p>
    <div className="card-duo">
      <h3 className="mb-5 text-xl font-black text-heading">AI 분석: 예상 VDT 질환 위험도 (예시)</h3>
      <div className="h-64"><ResponsiveContainer width="100%" height="100%">
        <BarChart data={examples} layout="vertical" margin={{ left: 40 }}>
          <XAxis type="number" domain={[0, 100]} hide /><YAxis type="category" dataKey="name" /><Tooltip />
          <Bar dataKey="risk" radius={[0, 8, 8, 0]} barSize={24} />
        </BarChart>
      </ResponsiveContainer></div>
    </div>
    <div className="card-duo">
      <h3 className="mb-2 flex items-center text-xl font-black text-heading"><Sparkles className="mr-2" />AI 맞춤형 피드백 및 의학 정보 (예시)</h3>
      <p className="mb-4 leading-7 text-muted">누적된 자세 데이터를 분석한 결과, 오후 시간대에 목 각도가 평균 15도 이상 앞으로 쏠리는 현상이 관찰되었습니다. 이는 전형적인 거북목 증후군의 전조 증상입니다.</p>
      <div className="rounded-xl bg-surface-muted p-4">
        <h4 className="mb-2 font-black text-heading">오늘의 추천 스트레칭 (예시)</h4>
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li>턱 당기기(Chin Tuck) 스트레칭: 10초 유지 x 5회 반복</li>
          <li>양팔을 뒤로 깍지 끼고 가슴 펴기: 15초 유지</li>
          <li>모니터 상단을 눈높이에 맞추어 시선이 15도 아래를 향하도록 작업 환경 개선 권장</li>
        </ul>
      </div>
    </div>
  </aside>;
}
