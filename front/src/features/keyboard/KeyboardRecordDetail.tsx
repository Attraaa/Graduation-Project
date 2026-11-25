import { useMemo, useState } from 'react';
import type { KeyboardStored } from '../../../../database/keyboard';
import { exploreKeys } from './keyExploration';
import KeyboardKeyExploration from './KeyboardKeyExploration';
import './keyboardRecords.css';

/** Key heatmap of one saved session in the learning history, laid on the detail panel itself; the most typed key starts selected. */
export default function KeyboardRecordDetail({ detail }: { detail: KeyboardStored }) {
  const { record, counts } = detail;
  const keys = useMemo(() => exploreKeys(counts, record.nearbyCredit), [counts, record.nearbyCredit]);
  const [selectedKey, setSelectedKey] = useState(() => [...keys].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))[0]?.code ?? 'KeyF');
  return <div className="keyboard-record-detail keyboard-record-plain">
    <KeyboardKeyExploration counts={counts} nearbyCredit={record.nearbyCredit} policyVersion={record.policyVersion} selectedKey={selectedKey} onSelect={setSelectedKey} />
  </div>;
}
