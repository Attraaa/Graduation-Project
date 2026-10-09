# Keyboard policy boundary

This directory contains Moti's versioned coaching policy and pure evaluation
logic, plus keyboard presentation, camera transform, and aggregate recording.
`evaluatePress.ts`, `types.ts`, and `fingerPolicy.ts` remain pure policy modules.
`KeyboardMonitor` owns the stream/service lifecycle. Current records use the shared `database/` contracts
and the authenticated HTTP/MySQL repository, not Electron SQLite.

`KeyboardRecordDetail` presents a single saved session from LearningHistory.
`KeyboardKeyExploration` shares the score/count heatmap and selected-key finger
distribution with Statistics. `keyExploration.ts` owns pure key grouping and a
display-only practice ranking (at least 10 valid observations, up to three keys,
descending nearby/mismatch ratio). Unknown and excluded input never becomes a
practice mistake. Only an exact supported stored policy supplies a recommended
finger table. Saved sessions appear in mixed history on their local start day;
history carries compact summaries and the existing detail API carries counts.

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
- Policy `ansi-qwerty-touch:2.0.0` gives preferred/acceptable 100, the immediately
  adjacent finger on the same hand 70, and other observed fingers 0. The chain is
  index-middle-ring-pinky; thumb and opposite-hand changes are not adjacency.
  Space accepts both thumbs. The 70 weight is a provisional product choice,
  not a result of CHI 2016. No per-key remapping is applied.
- Unsupported keys and uncertain perception return `unknown`; they never count
  as mistakes.
- Runtime thresholds are provisional: keyboard model quality >=0.18, hand-label
  score >=0.8, absolute frame delta <=180ms, outside-target center distance <=0.9
  key widths. Two different candidates with the same inside/outside status and
  distance difference <=0.12 key widths produce unknown. Duplicate finger IDs
  do not create ambiguity. These are geometric heuristics, not calibrated
  probabilities; labelled recordings are still required.
- There is no direct occlusion classifier. MediaPipe Hands does not provide
  reliable per-tip visibility here; we use its handedness classification score
  and valid in-frame coordinates instead of treating missing visibility as
  perfect confidence. It can still infer an occluded fingertip incorrectly.
  The UI says observation missing/ambiguous/delayed, not confirmed occlusion.
- Summary score excludes unknown, unsupported keys, and Ctrl/Alt/Meta shortcuts.
  Coverage is valid/(valid+unknown); unsupported/shortcut counts are separate.
  Consistency groups physical code and left/right/both Shift context, includes
  only groups with >=10 observed presses, and is sum(dominant finger counts)/
  sum(eligible counts). It never adds score. Shift keys themselves are unsupported.
- Persist `policyId` and `policyVersion` with aggregates so historical results
  remain interpretable when the policy changes.

## Camera and external observation

Camera crop uses normalized bounds, 1-degree rotation, cover scaling without
black corners, brightness/contrast filters, and requested resolution. Output
dimensions stay equal to the actual camera frame; cover scaling trims edges.
The displayed canvas and the JPEG sent to Python use the same transformed image;
analysis preserves the aspect ratio and is capped at 960 pixels wide.
Changing the transform invalidates buffered frames and the frozen keyboard map.
Wheel zoom (1–5×) and normalized drag panning change this actual analysis canvas
and save automatically per mode/device. They restore after closing the settings
window or restarting a session, and never start the camera themselves.
Resolution changes request constraints on the active track. Hardware exposure is
offered only when that track advertises supported modes/ranges; focus is not
implemented. Software filters cannot recover clipped camera information.

The common native settings window opens beside the learning-page device selector,
shares the parent preview, and never starts a camera. Profiles save automatically
per mode and actual device. Four outer-boundary handles, whole-grid dragging, and
grid-only flips/rotation work before automatic recognition succeeds; key names
are always shown. The normalized 61-key layout is the same JSON used by Python.
Editing pauses attribution and manual geometry freezes the real analyzer map.
Saved `grid.quad` coordinates refer to the oriented/cropped image before zoom/pan.
Display edits and detected corners are inversely projected before saving. The
local `manual_keyboard` payload contains this quad plus `framing: {zoom, panX,
panY}`; Python projects the same 61-key map onto the actual JPEG coordinates,
including boundaries partly outside the cropped view. The final analysis map
retains the minimum 1.5% area gate; stored small source boundaries survive zoom-out.
Manual geometry is explicitly validated, not assigned fabricated AI confidence;
all hand/timing/distance/ambiguity gates remain. Recognition metadata is
`hands-camera-manual-v3`; the coaching policy and server schema are unchanged.
Preview RAF is independent of the one-in-flight asynchronous binary JPEG pipeline
(up to 20Hz opportunities); old fingertips expire after 500ms. See the full
[camera contract](../../../../docs/camera-settings.md) and its validation limits.

External observation is off by default. Settings approves exact executable paths
through the Electron file picker and chooses Ctrl+Alt+F1~F12 for stopping. Start
requires an explicit checkbox and button. The Python Windows Raw Input observer
registers INPUTSINK only while an approved non-elevated app is foreground,
checks identity/elevation again before reading a scan code, and unregisters
elsewhere. Identity/elevation failures exclude the app. Known game names and
common game directories are rejected at approval; there is no exhaustive game
classifier. Do not approve games or sensitive apps. No hook, NOLEGACY, input
injection, admin elevation, driver, tray, or autostart is used by this path.
The standalone legacy pynput test is separate and disabled in the embedded API.

Window lock/suspend, page exit, camera/service failure, stop button, and stop
shortcut end observation; resuming requires another explicit start. No API can
promise antivirus/anti-cheat compatibility. The loopback process uses a fresh
random token, accepts one authenticated socket, and does not expose the test
page. Preload has only specific commands and main validates the original main
window. Camera frames (12) and pending events (64) are bounded in memory and
cleared on exclusion/disconnection/reset. A full queue discards new events;
counts describe completed analyses, not a guarantee of every OS press.
Tokens, images, input text, and event order are not written to application logs
or the database. Same-user malware can still inspect process memory and local
files. This is data minimization, not OS isolation or encrypted SQLite.

`KeyboardStatistics` supplies score/agreement/coverage/consistency, daily trends,
key heatmaps, finger/reason distributions, frequent differences, and session
details, grouped by identical score/recognition versions and weight. SQLite and
retry/delete/close contracts are in [database/README.md](../../../../database/README.md).
