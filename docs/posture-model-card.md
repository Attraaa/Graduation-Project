# MultiPosture trunk MLP v1

## 출처와 재사용

- Dataset: **MultiPosture: A Dataset of body joints keypoints extracted using MediaPipe for multi-task sitting posture recognition with upper and lower body labels**, version 1 (2024).
- Creators: David Carneros Prado, Luis Cabañero Gómez, Jesus Fontecha, Ramon Hervas, Iván González Díaz, Esperanza Johnson.
- DOI / source: [10.5281/zenodo.14230872](https://doi.org/10.5281/zenodo.14230872), [official API](https://zenodo.org/api/records/14230872).
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), metadata verified 2026-10-17. Original metadata and CSV are retained locally under `reports/posture-augmentation/data/`.
- Source CSV MD5: `7efbc94d653acf32eefecec3ff26d6c6`; SHA-256: `d21579200db9a57dd01c24fa6ece961b0be73aa0d5d402ae8e629761c03ebe38`.
- Changes by this project: selected five world-coordinate joints, seven normalized features, merged lateral labels, trained/exported a new classifier. Dataset authors have not endorsed Moti. We redistribute model parameters and aggregate evaluation, not source participant images or coordinates.

## Intended use

Four-class seated trunk classifier: upright, forward, backward, lateral. In the local v6 experiment (same learned weights as v5) it can corroborate relative geometry only if all reference samples are accepted upright and the current visible-hip forward label persists for one second. Contribution is zero without these conditions or without head/height deviation, capped at 0.08 in the 25% neck channel (at most 12.5 additional raw score points). It never changes shoulder scores or blocks basic calibration. Cropped laptop views normally receive **zero model contribution**. This integration is provisional and has not demonstrated improved Moti webcam accuracy. It is not a CVA or forward-head diagnosis model. See [decision report](posture-model-review.md).

## Input contract

MediaPipe `poseWorldLandmarks`: nose 0, shoulders 11/12, hips 23/24. Shoulder center `S`, hip center `H`, nose `N`, 3D shoulder span `W`. Features, in order:

`abs((S-H).x)/W, (S-H).y/W, (S-H).z/W, abs((N-S).x)/W, (N-S).y/W, (N-S).z/W, abs(Lshoulder.y-Rshoulder.y)/W`.

These features are translation/scale invariant and left/right mirror invariant; yaw, roll and perspective are not fully invariant. Image-normalized x/y/z are a different coordinate system and must not be substituted. [MediaPipe coordinate outputs](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker).

Runtime requires visible in-frame nose, shoulders and hips (visibility ≥0.8), finite world coordinates and nonzero shoulder width. It rejects features outside training 0.5–99.5% quantiles plus 25% range padding, softmax maximum <0.85 or top-two margin <0.25. A label must persist for one second with gaps ≤500ms. Missing tracking, pause, changed reference and inconsistent time reset confirmation. Softmax is not calibrated correctness probability and visibility is not guaranteed landmark accuracy.

## Training and evaluation

NumPy 1.26.4 / Python 3.12.14 from the existing project lock. Seed 20261017; fixed 7–16–4 tanh MLP; 600 full-batch Adam steps, learning rate 0.02, weight regularization 0.001. Training weights balance participant contribution then class mass. No hyperparameter search on the test subjects. Per-fold standardization and range checks fit training participants only. Exact cross-participant feature duplicates are rejected. Near-duplicate images cannot be audited because raw videos are not provided.

Actual downloaded file: 4,794 rows, 13 subject IDs, 102 columns. The landing page describes 4,800 rows/11 joints, but CSV contains all 33 xyz joints. Selected labels: upright 1,615; forward 1,897; backward 442; lateral 840.

LOSO over 13 participants: all rows accuracy **97.85%**, balanced accuracy **97.80%**. After feature/confidence abstention: coverage **88.42%** (4,239 rows), conditional accuracy **99.58%**. Unconditional correct-and-accepted fraction is **88.05%** (4,221/4,794); rejected frames are not correct predictions. Participant-level all-row accuracy ranges **88.52–99.63%**. Full per-fold confusion matrices are in [evaluation JSON](posture-model-evaluation.json). No time ordering/visibility metadata is available, so runtime visibility and one-second confirmation are **not included** in these coverage/accuracy figures.

## Deployment limitations and decision

Source extraction used MediaPipe Heavy; the app keeps Full to preserve its existing simultaneous eye/posture workload. Source-domain LOSO does not validate this extraction-model change, camera height, cropped laptop view, clothing, lighting, disabilities, unseen people or temporal behavior. These limit the current experimental contribution and require a Moti-specific held-out evaluation before expanding it. No CVA labels were present. No neck-angle regression or clinical accuracy claim was trained.

Parameter artifact: `front/src/features/posture/trunkModel.ts` (plain numeric parameters, no executable downloaded model). Inference: `trunkClassifier.ts`, conditionally used through calibration/observation. The local `reports/posture-augmentation/model-inspector.html` shows all 4,794 rows and held-out predictions generated by `scripts/posture/build_model_report.py`. It validates row alignment and aggregate metrics against `predictions.json` before rendering. Reproduction and real-world validation protocol: [augmentation guide](posture-augmentation.md).
