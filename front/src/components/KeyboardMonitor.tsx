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

interface KeyboardMonitorProps {
  isRunning: boolean
  deviceId: string
  remapRequest: number
  onUpdate: (snapshot: KeyboardMonitorSnapshot) => void
}

interface FrameResponse {
  ok: boolean
  error?: string
  buffered_frames?: number
  frame?: { size: [number, number]; fingers: RuntimeFingerPoint[] }
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

export default function KeyboardMonitor({ isRunning, deviceId, remapRequest, onUpdate }: KeyboardMonitorProps) {
  const { videoRef, startWebcam, stopWebcam, webcamError } = useWebcam()
  const overlayRef = useRef<HTMLCanvasElement>(null)
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
    let socket: Socket | null = null
    let token = ''
    let frameTimer: ReturnType<typeof setInterval> | undefined
    let mappingTimer: ReturnType<typeof setInterval> | undefined
    let frameInFlight = false
    let mappingInFlight = false
    let bufferedFrames = 0
    let mapped = false
    let removeTrackListener = () => {}

    const fail = (message: string) => {
      if (!abort.signal.aborted) publish({ phase: 'error', message })
    }

    const requestMapping = () => {
      if (!socket?.connected || mappingInFlight || bufferedFrames < 2) return
      mappingInFlight = true
      mapped = false
      publish({ phase: 'mapping', message: '키보드 위치를 인식하고 있습니다. 손을 잠시 키보드 밖으로 빼 주세요.' })
      socket.timeout(12_000).emit('calibrate_keyboard', { token }, (timeoutError: Error | null, response?: MappingResponse) => {
        mappingInFlight = false
        if (abort.signal.aborted) return
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
        drawOverlay(overlayRef.current, response.mapping, fingersRef.current, latestRef.current)
        publish({ phase: 'ready', message: '키보드 위치를 잡았습니다. 이 화면에서 타이핑해 보세요.' })
      })
    }
    remapRef.current = requestMapping

    const sendFrame = () => {
      const video = videoRef.current
      if (!socket?.connected || frameInFlight || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context || !canvas.width || !canvas.height) return
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      frameInFlight = true
      const release = window.setTimeout(() => { frameInFlight = false }, 1500)
      socket.emit('frame', {
        token,
        image: canvas.toDataURL('image/jpeg', 0.7),
        browser_perf_ms: performance.now(),
      }, (response: FrameResponse) => {
        window.clearTimeout(release)
        frameInFlight = false
        if (abort.signal.aborted || !response?.ok) return
        bufferedFrames = response.buffered_frames ?? bufferedFrames
        fingersRef.current = response.frame?.fingers ?? []
        if (response.frame?.size && mappingRef.current) mappingRef.current.size = response.frame.size
        drawOverlay(overlayRef.current, mappingRef.current, fingersRef.current, latestRef.current)
      })
    }

    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || !mapped || !socket?.connected) return
      socket.emit('browser_key', {
        token,
        key: event.key,
        code: event.code,
        location: event.location,
        browser_perf_ms: performance.now(),
      })
    }

    const setup = async () => {
      if (!window.motiKeyboard) throw new Error('키보드 실시간 분석은 Electron 앱에서 실행해 주세요.')
      publish({ ...initialKeyboardSnapshot, phase: 'starting', message: '카메라와 로컬 분석 모델을 준비하고 있습니다.' })
      const [service, stream] = await Promise.all([
        window.motiKeyboard.start(),
        startWebcam(deviceId || undefined),
      ])
      if (abort.signal.aborted) return
      if (!stream) throw new Error('카메라를 시작하지 못했습니다. 카메라 권한과 연결 상태를 확인해 주세요.')
      token = service.token
      const track = stream.getVideoTracks()[0]
      const ended = () => fail('카메라 연결이 중단되었습니다.')
      track.addEventListener('ended', ended)
      removeTrackListener = () => track.removeEventListener('ended', ended)
      const video = videoRef.current
      if (!video) throw new Error('카메라 화면을 준비하지 못했습니다.')
      await video.play()

      socket = io(service.origin, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        timeout: 8000,
      })
      socket.on('connect', () => {
        if (abort.signal.aborted) return
        publish({ phase: 'mapping', message: '카메라가 연결되었습니다. 키보드 위치를 찾고 있습니다.' })
        frameTimer = setInterval(sendFrame, 150)
        mappingTimer = setInterval(() => { if (!mapped) requestMapping() }, 2500)
        sendFrame()
      })
      socket.on('connect_error', error => fail(`로컬 키보드 분석 연결 실패: ${error.message}`))
      socket.on('press_result', (payload: RuntimePressPayload) => {
        if (abort.signal.aborted) return
        const result = adaptRuntimePress(payload)
        latestRef.current = result
        const recent = [result, ...snapshotRef.current.recent].slice(0, 8)
        drawOverlay(overlayRef.current, payload.keyboard ?? mappingRef.current, payload.finger_keys ?? fingersRef.current, result)
        publish({
          phase: 'ready',
          message: '입력과 가장 가까운 카메라 프레임으로 손가락을 판정했습니다.',
          latest: result,
          recent,
          detectedPresses: snapshotRef.current.detectedPresses + 1,
        })
      })
      window.addEventListener('keydown', keyDown)
    }

    void setup().catch(error => {
      fail(errorMessage(error))
      stopWebcam()
      void window.motiKeyboard?.stop()
    })

    return () => {
      abort.abort()
      clearInterval(frameTimer)
      clearInterval(mappingTimer)
      removeTrackListener()
      window.removeEventListener('keydown', keyDown)
      socket?.disconnect()
      remapRef.current = () => {}
      mappingRef.current = null
      fingersRef.current = []
      latestRef.current = null
      drawOverlay(overlay, null, [], null)
      stopWebcam()
      void window.motiKeyboard?.stop()
    }
  }, [isRunning, deviceId, onUpdate, publish, startWebcam, stopWebcam, videoRef])

  useEffect(() => {
    if (isRunning && remapRequest > 0) remapRef.current()
  }, [isRunning, remapRequest])

  useEffect(() => {
    if (isRunning && webcamError) publish({ phase: 'error', message: webcamError })
  }, [isRunning, webcamError, publish])

  const error = view.phase === 'error' ? view.message : null
  return (
    <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-2xl bg-slate-950">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-contain" />
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
