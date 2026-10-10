import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CameraOff, ScanLine } from 'lucide-react'
import { io, type Socket } from 'socket.io-client'
import { useWebcam } from '../hooks/useWebcam'
import {
  adaptRuntimePress,
  type RuntimeFingerPoint,
  type RuntimeKeyboardMapping,
  type RuntimePressPayload,
} from '../features/keyboard/runtime'
import { initialKeyboardSnapshot } from '../features/keyboard/monitorTypes'
import type { KeyboardLiveResult } from '../features/keyboard/runtime'
import type { KeyboardMonitorSnapshot } from '../features/keyboard/monitorTypes'
import { useCameraSettings } from '../features/camera/context'
import { imageSignature, validQuad } from '../features/camera/profile'
import { analysisGrid, automaticQuad, displayedGrid } from '../features/camera/grid'
import { beginKeyboardRecording } from '../features/keyboard/recording'
import { keyboardCountKey } from '../../../database/keyboard'
import type { KeyboardCount } from '../../../database/keyboard'
import { localDateKey } from '../../../database/contracts'

interface KeyboardMonitorProps {
  isRunning: boolean
  paused?: boolean
  deviceId: string
  remapRequest: number
  onUpdate: (snapshot: KeyboardMonitorSnapshot) => void
  external: boolean
}

interface FrameResponse {
  ok: boolean
  error?: string
  buffered_frames?: number
  frame?: { size: [number, number]; fingers: RuntimeFingerPoint[] }
  timing?: { inference_ms: number }
}

interface MappingResponse {
  ok: boolean
  error?: string | null
  mapping?: RuntimeKeyboardMapping
}

const mappingMessage = (reason?: string | null) => ({
  no_frame_available: '카메라 프레임을 기다리고 있습니다.',
  missing_corners: '키보드 전체와 네 모서리 키가 화면에 보이도록 카메라를 조절해 주세요.',
  low_confidence: '키보드가 더 선명하게 보이도록 조명과 초점을 조절해 주세요.',
  keyboard_too_small_or_bad_geometry: '키보드가 화면에서 더 크게 보이도록 카메라를 가까이 조절해 주세요.',
  bad_keyboard_aspect: '키보드를 정면에 가깝게 비추도록 카메라 각도를 조절해 주세요.',
  mapped_keys_out_of_frame: '키보드 전체가 화면 안에 들어오도록 카메라를 조절해 주세요.',
}[reason ?? ''] ?? '키보드 위치를 아직 확정하지 못했습니다. 카메라 위치를 조절해 주세요.')

const errorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('Electron')) return message
  if (message.includes('Python 환경')) return message
  return message || '키보드 분석 연결에 실패했습니다.'
}

const drawOverlay = (
  canvas: HTMLCanvasElement | null,
  mapping: RuntimeKeyboardMapping | null,
  fingers: RuntimeFingerPoint[],
  latest: KeyboardLiveResult | null,
) => {
  if (!canvas) return
  const [width, height] = mapping?.size ?? [canvas.width, canvas.height]
  if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)

  for (const [key, polygon] of Object.entries(mapping?.keys ?? {})) {
    if (polygon.length < 4) continue
    const selected = latest && key.trim().toLowerCase() === latest.pressedKey.trim().toLowerCase()
    context.beginPath()
    context.moveTo(polygon[0][0], polygon[0][1])
    polygon.slice(1).forEach(point => context.lineTo(point[0], point[1]))
    context.closePath()
    context.lineWidth = selected ? 4 : 1
    context.strokeStyle = selected ? '#facc15' : 'rgba(56, 189, 248, 0.55)'
    context.stroke()
    const x = polygon.reduce((n, p) => n + p[0], 0) / polygon.length
    const y = polygon.reduce((n, p) => n + p[1], 0) / polygon.length
    context.font = `${Math.max(9, width / 100)}px sans-serif`
    context.textAlign = 'center'; context.textBaseline = 'middle'
    context.lineWidth = 3; context.strokeStyle = '#0f172a'; context.fillStyle = '#ffffff'
    context.strokeText(key, x, y); context.fillText(key, x, y)
  }

  for (const point of fingers) {
    context.beginPath()
    context.arc(point.x, point.y, 6, 0, Math.PI * 2)
    context.fillStyle = point.hand.toLowerCase() === 'left' ? '#22c55e' : '#a855f7'
    context.fill()
    context.lineWidth = 2
    context.strokeStyle = '#ffffff'
    context.stroke()
  }
}

export default function KeyboardMonitor({ isRunning, paused = false, deviceId, remapRequest, onUpdate, external }: KeyboardMonitorProps) {
  const pausedRef = useRef(paused)
  const pauseAnalysis = useRef<() => void>(() => {})
  useEffect(() => { pausedRef.current = paused; pauseAnalysis.current() }, [paused])
  const { videoRef, startWebcam, stopWebcam, webcamError } = useWebcam()
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const { connect, detach, runtime, setGrid, reportMetrics, setInvalidator } = useCameraSettings()
  const mappingRef = useRef<RuntimeKeyboardMapping | null>(null)
  const fingersRef = useRef<RuntimeFingerPoint[]>([])
  const latestRef = useRef<KeyboardLiveResult | null>(null)
  const remapRef = useRef<() => void>(() => {})
  const snapshotRef = useRef(initialKeyboardSnapshot)
  const [view, setView] = useState(initialKeyboardSnapshot)

  const publish = useCallback((update: Partial<KeyboardMonitorSnapshot>) => {
    const next = { ...snapshotRef.current, ...update }
    snapshotRef.current = next
    setView(next)
    onUpdate(next)
  }, [onUpdate])

  useEffect(() => {
    if (!isRunning) return

    const abort = new AbortController()
    const overlay = overlayRef.current
    const preview = previewRef.current
    let socket: Socket | null = null
    let token = ''
    let frameTimer: ReturnType<typeof setInterval> | undefined
    let mappingTimer: ReturnType<typeof setInterval> | undefined
    let settingsTimer: ReturnType<typeof setInterval> | undefined
    const analysisCanvas = document.createElement('canvas')
    let mappingSignature = ''
    let lastFingerAt = 0
    let lastVideoTime = -1
    let frameInFlight = false
    let mappingInFlight = false
    let bufferedFrames = 0
    let mapped = false
    let removeTrackListener = () => {}
    let sink: ReturnType<typeof beginKeyboardRecording> | null = null
    let revision = 0
    let removeHaltListener = () => {}
    const counts = new Map<string, KeyboardCount>()
    const shifts = new Set<string>()

    const fail = (message: string) => {
      if (!abort.signal.aborted) {
        publish({ phase: 'error', message, latest: null, recent: [] }); mapped = false
        clearInterval(frameTimer); clearInterval(mappingTimer); clearInterval(settingsTimer); socket?.disconnect()
        sink?.finish(); stopWebcam(); detach(); void window.motiKeyboard?.stop()
      }
    }

    const requestMapping = () => {
      if (pausedRef.current || !socket?.connected || mappingInFlight || bufferedFrames < 2 || runtime.current.editing) return
      mappingInFlight = true
      const requestedRevision = revision
      mapped = false
      const manual = runtime.current.profile.grid.source === 'manual'
      publish({ phase: 'mapping', message: manual ? '직접 맞춘 키보드 영역을 적용하고 있습니다.' : '키보드 위치를 인식하고 있습니다. 손을 잠시 키보드 밖으로 빼 주세요.' })
      socket.timeout(12_000).emit(manual ? 'manual_keyboard' : 'calibrate_keyboard', { token, grid: analysisGrid(runtime.current.profile) }, (timeoutError: Error | null, response?: MappingResponse) => {
        if (abort.signal.aborted || requestedRevision !== revision) return
        mappingInFlight = false
        if (timeoutError || !response) {
          publish({ phase: 'mapping', message: '키보드 위치 인식 응답을 기다리는 중입니다.' })
          return
        }
        if (!response.ok || !response.mapping) {
          publish({ phase: 'mapping', message: mappingMessage(response.error) })
          return
        }
        mapped = true
        mappingRef.current = response.mapping
        if (!manual && response.mapping.size) {
          const quad = automaticQuad(response.mapping.keys, ...response.mapping.size)
          if (validQuad(quad)) setGrid({ ...runtime.current.profile.grid, quad })
        }
        drawOverlay(overlayRef.current, response.mapping, fingersRef.current, latestRef.current)
        publish({ phase: 'ready', message: manual ? '직접 맞춘 영역으로 입력을 확인합니다. 키 이름이 실제 키 위치와 맞는지 확인해 주세요.' : '키보드 위치를 잡았습니다. 이 화면에서 타이핑해 보세요.' })
      })
    }
    remapRef.current = () => {
      if (!socket?.connected) return
      revision += 1; mapped = false; bufferedFrames = 0; mappingInFlight = false
      mappingRef.current = null; latestRef.current = null; fingersRef.current = []
      drawOverlay(overlayRef.current, null, [], null)
      publish({ phase: 'mapping', latest: null, recent: [], message: runtime.current.editing ? '키보드 영역 조정 중 · 입력 판정은 잠시 쉽니다.' : '카메라 설정에 맞춰 키보드 영역을 준비하고 있습니다.' })
      socket?.emit('reset_analysis', { token })
    }
    setInvalidator(() => remapRef.current())

    const sendFrame = () => {
      const video = videoRef.current
      if (pausedRef.current || !socket?.connected || frameInFlight || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      const source = preview
      if (!source?.width || !source.height) return
      if (runtime.current.videoTime === lastVideoTime || runtime.current.frameAt === null) return
      lastVideoTime = runtime.current.videoTime
      const canvas = analysisCanvas
      const width = Math.min(960, source.width), height = Math.round(source.height * width / source.width)
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      const capturedAt = runtime.current.frameAt
      const encodingStarted = performance.now()
      canvas.getContext('2d')?.drawImage(source, 0, 0, width, height)
      if (overlayRef.current && !mappingRef.current) { overlayRef.current.width = canvas.width; overlayRef.current.height = canvas.height }
      const sentRevision = revision
      frameInFlight = true
      canvas.toBlob(blob => {
        if (abort.signal.aborted || pausedRef.current || sentRevision !== revision || !socket?.connected) { frameInFlight = false; return }
        if (!blob) { frameInFlight = false; return }
        const encodedAt = performance.now()
        socket.timeout(5000).emit('frame', { token, image: blob, browser_perf_ms: capturedAt,
          input_is_mirrored: runtime.current.profile.flipX !== runtime.current.profile.flipY }, (error: Error | null, response?: FrameResponse) => {
          frameInFlight = false
          if (abort.signal.aborted || sentRevision !== revision) return
          if (error) { fail('영상 분석 응답이 지연되어 관찰을 중지했습니다. 다시 시작해 주세요.'); return }
          if (!response?.ok) return
          const receivedAt = performance.now()
          bufferedFrames = response.buffered_frames ?? bufferedFrames
          const age = receivedAt - capturedAt
          reportMetrics({ encodingMs: encodedAt - encodingStarted, roundTripMs: receivedAt - encodedAt, inferenceMs: response.timing?.inference_ms ?? 0, resultAgeMs: age })
          fingersRef.current = age <= 500 ? response.frame?.fingers ?? [] : []
          lastFingerAt = capturedAt
          drawOverlay(overlayRef.current, mappingRef.current, fingersRef.current, latestRef.current)
        })
      }, 'image/jpeg', .72)
    }

    const keyDown = (event: KeyboardEvent) => {
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') shifts.add(event.code)
      if (pausedRef.current || event.repeat || !mapped || runtime.current.editing || !socket?.connected) return
      if (event.target instanceof Element && event.target.closest('button, select, input, [contenteditable="true"]')) return
      if (event.target instanceof HTMLInputElement && event.target.type === 'password') return
      const context = event.ctrlKey || event.altKey || event.metaKey ? 'shortcut'
        : shifts.size === 2 ? 'shift-both' : shifts.has('ShiftRight') ? 'shift-right' : event.shiftKey ? 'shift-left' : 'plain'
      socket.emit('browser_key', {
        token,
        context,
        code: event.code,
        location: event.location,
        browser_perf_ms: performance.now(),
      })
    }
    const keyUp = (event: KeyboardEvent) => shifts.delete(event.code)
    const blur = () => shifts.clear()
    pauseAnalysis.current = () => {
      shifts.clear(); revision += 1; mappingInFlight = false; frameInFlight = false
      if (!socket?.connected) return
      if (pausedRef.current) {
        mapped = false
        if (external) socket.emit('stop_observation', { token })
        socket.emit('reset_analysis', { token })
      } else {
        remapRef.current()
        if (external) socket.emit('start_observation', { token }, (response: { ok: boolean }) => {
          if (!abort.signal.aborted && !pausedRef.current && !response?.ok) fail('승인 앱 관찰을 재개할 수 없습니다.')
        })
      }
    }

    const setup = async () => {
      if (!window.motiKeyboard) throw new Error('키보드 실시간 분석은 Electron 앱에서 실행해 주세요.')
      publish({ ...initialKeyboardSnapshot, phase: 'starting', message: '카메라와 로컬 분석 모델을 준비하고 있습니다.' })
      // Handle both promises immediately; camera readiness must not wait on model initialization.
      const servicePromise = window.motiKeyboard.start(external)
      void servicePromise.catch(() => {})
      const stream = await startWebcam(deviceId || undefined)
      if (abort.signal.aborted) return
      if (!stream) throw new Error('카메라를 시작하지 못했습니다. 카메라 권한과 연결 상태를 확인해 주세요.')
      const track = stream.getVideoTracks()[0]
      const ended = () => fail('카메라 연결이 중단되었습니다.')
      track.addEventListener('ended', ended)
      removeTrackListener = () => track.removeEventListener('ended', ended)
      const video = videoRef.current
      if (!video) throw new Error('카메라 화면을 준비하지 못했습니다.')
      if (!preview) throw new Error('카메라 화면을 준비하지 못했습니다.')
      await connect(video, stream, preview, overlay)
      publish({ phase: 'starting', message: '영상이 연결되었습니다. 분석 준비 중입니다.' })
      const service = await servicePromise
      if (abort.signal.aborted) return
      token = service.token
      sink = beginKeyboardRecording()
      removeHaltListener = window.motiKeyboard.onHalt(() => {
        fail('관찰을 중지했습니다. 다시 시작하려면 측정 중지 후 시작 버튼을 누르세요.')
      })

      socket = io(service.origin, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        timeout: 8000,
      })
      socket.on('connect', () => {
        if (abort.signal.aborted) return
        publish({ phase: 'mapping', message: '카메라가 연결되었습니다. 키보드 위치를 찾고 있습니다.' })
        frameTimer = setInterval(sendFrame, 50)
        mappingTimer = setInterval(() => { if (!mapped) requestMapping() }, 500)
        settingsTimer = setInterval(() => {
          const state = runtime.current
          const signature = `${imageSignature(state.profile)}:${preview.width}:${preview.height}:${state.editing ? 'editing' : state.profile.grid.source === 'manual' ? JSON.stringify(state.profile.grid) : 'automatic'}`
          if (signature !== mappingSignature) { mappingSignature = signature; remapRef.current() }
          if (fingersRef.current.length && performance.now() - lastFingerAt > 500) { fingersRef.current = []; drawOverlay(overlayRef.current, mappingRef.current, [], latestRef.current) }
        }, 50)
        sendFrame()
        if (external && !pausedRef.current) socket?.emit('start_observation', { token }, (response: { ok: boolean }) => {
          if (!response?.ok) fail('승인 앱 관찰을 시작할 수 없습니다. 승인 앱 설정을 확인해 주세요.')
        })
      })
      socket.on('connect_error', error => fail(`로컬 키보드 분석 연결 실패: ${error.message}`))
      socket.on('disconnect', () => { if (!abort.signal.aborted && snapshotRef.current.phase !== 'error') fail('로컬 분석 연결이 끊어졌습니다.') })
      socket.on('observation_status', (payload: { status: KeyboardMonitorSnapshot['observationStatus'] }) => {
        if (abort.signal.aborted || pausedRef.current) return
        publish({ observationStatus: payload.status, ...(payload.status !== 'observing' ? { latest: null, recent: [] } : {}) })
        if (payload.status === 'error') fail('승인 앱의 권한을 확인할 수 없어 관찰을 중지했습니다.')
      })
      socket.on('press_result', (payload: RuntimePressPayload) => {
        if (abort.signal.aborted || pausedRef.current || !mapped || runtime.current.editing) return
        const result = adaptRuntimePress(payload)
        sink?.press(result)
        const row: KeyboardCount = { date: localDateKey(Date.now(), new Date().getTimezoneOffset()), code: result.code,
          context: result.context, finger: result.evaluation.observed, verdict: result.evaluation.verdict,
          reason: result.evaluation.reason, count: 1 }
        const key = keyboardCountKey(row)
        counts.set(key, { ...row, count: (counts.get(key)?.count ?? 0) + 1 })
        latestRef.current = result
        const recent = [result, ...snapshotRef.current.recent].slice(0, 8)
        drawOverlay(overlayRef.current, mappingRef.current, fingersRef.current, result)
        publish({
          phase: 'ready',
          message: '입력과 가장 가까운 카메라 프레임으로 손가락을 판정했습니다.',
          latest: result,
          recent,
          detectedPresses: snapshotRef.current.detectedPresses + 1,
          counts: [...counts.values()],
        })
      })
      window.addEventListener('keydown', keyDown)
      window.addEventListener('keyup', keyUp)
      window.addEventListener('blur', blur)
    }

    void setup().catch(error => {
      if (abort.signal.aborted) return
      fail(errorMessage(error))
    })

    return () => {
      abort.abort()
      pauseAnalysis.current = () => {}
      clearInterval(frameTimer)
      clearInterval(mappingTimer)
      clearInterval(settingsTimer)
      removeTrackListener()
      removeHaltListener(); sink?.finish(); shifts.clear()
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
      socket?.disconnect()
      remapRef.current = () => {}
      setInvalidator(null)
      mappingRef.current = null
      fingersRef.current = []
      latestRef.current = null
      if (preview) { preview.width = 0; preview.height = 0 }
      drawOverlay(overlay, null, [], null)
      stopWebcam()
      detach()
      void window.motiKeyboard?.stop()
    }
  }, [isRunning, deviceId, external, onUpdate, publish, startWebcam, stopWebcam, videoRef, connect, detach, runtime, setGrid, reportMetrics, setInvalidator])

  const previousRemap = useRef(remapRequest)
  useEffect(() => {
    if (previousRemap.current === remapRequest) return
    previousRemap.current = remapRequest
    if (isRunning) { setGrid({ ...displayedGrid(runtime.current.profile), source: 'automatic', flipX: false, flipY: false, turns: 0 }); remapRef.current() }
  }, [isRunning, remapRequest, runtime, setGrid])

  useEffect(() => {
    if (isRunning && webcamError) publish({ phase: 'error', message: webcamError })
  }, [isRunning, webcamError, publish])

  const error = view.phase === 'error' ? view.message : null
  return (
    <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-2xl bg-slate-950">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={previewRef} className="absolute inset-0 h-full w-full object-contain" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
      {!isRunning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
          <CameraOff size={32} />
          <p>시작하면 카메라와 로컬 키보드 분석기를 연결합니다.</p>
          <p className="text-sm">입력 내용은 저장하거나 외부 서버로 보내지 않습니다.</p>
        </div>
      )}
      {isRunning && view.phase !== 'ready' && !error && (
        <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-xl bg-slate-900/85 p-4 text-white">
          <ScanLine className="shrink-0" size={22} />
          <p>{view.message}</p>
        </div>
      )}
      {isRunning && error && (
        <div role="alert" className="absolute inset-x-4 top-4 flex gap-3 rounded-xl bg-red-50 p-4 text-red-800">
          <AlertCircle className="shrink-0" size={22} /><p className="whitespace-pre-line">{error}</p>
        </div>
      )}
      {isRunning && view.phase === 'ready' && (
        <div className="absolute bottom-4 left-4 rounded-xl bg-slate-900/85 px-4 py-2 text-sm font-bold text-white">
          왼손 <span className="text-green-400">●</span> · 오른손 <span className="text-purple-400">●</span>
        </div>
      )}
    </div>
  )
}
