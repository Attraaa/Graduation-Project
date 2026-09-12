# Keyboard policy boundary

This directory contains Moti's versioned coaching policy and pure evaluation
logic. It does not start cameras, capture keys, call Electron IPC, save data, or
change another learning mode.

## Evidence and product interpretation

- Hancom Typing presents position practice and reports per-key and per-finger
  statistics, but its public help does not provide a machine-readable normative
  finger table: https://help.hancom.com/hoffice/multi/ko_kr/hnctt/tools/setting.htm
- The ANSI QWERTY mapping in `fingerPolicy.ts` is the conventional touch-typing
  teaching baseline. It is identified as a product policy, not a clinical rule.
- Feit, Weir, and Oulasvirta (CHI 2016) found that everyday typists use diverse
  strategies and that consistent finger-to-key mapping and reduced global hand
  motion matter more than enforcing one universal technique:
  https://userinterfaces.aalto.fi/how-we-type/resources/HowWeType_CHI16.pdf
- Korean-layout fatigue research models key frequency, finger load, and travel,
  while noting limitations around Shift and real movement. It supports keeping
  movement metrics separate from a strict correct/incorrect label:
  https://www.kais99.org/jkais/journal/Vol25no06/Vol25no06p26.pdf
- OSHA guidance emphasizes neutral wrist posture and workstation placement; a
  preferred-finger result alone must not be presented as preventing VDT or a
  musculoskeletal disorder:
  https://www.osha.gov/etools/computer-workstations/components/keyboards

## Policy rules

- Use physical `KeyboardEvent.code` values so Korean 2-set and English input
  share the same key positions.
- `preferred` is the teaching baseline; `acceptable` represents an approved
  alternative such as the right index finger for `KeyB`.
- Unsupported keys and uncertain perception return `unknown`; they never count
  as mistakes.
- Evaluation thresholds are supplied by the caller and must be calibrated with
  labelled recordings before product integration.
- Persist `policyId` and `policyVersion` with aggregates so historical results
  remain interpretable when the policy changes.
