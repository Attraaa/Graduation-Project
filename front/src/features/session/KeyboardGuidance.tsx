import GuidanceBand from './GuidanceBand';
import { useMonitoring } from './monitoringContext';
import { keyboardGuidance } from './presentation';

/** 키보드 카메라 화면 아래쪽 띠(회색 안내 칸 대신). */
export default function KeyboardGuidance() {
  const { keyboard } = useMonitoring();
  return <GuidanceBand label="키보드 측정 안내" lines={keyboardGuidance(keyboard.snapshot, keyboard.controls)} />;
}
