import type { AssetMeta } from './db'

export interface ProbeResult {
  duration?: number
  width?: number
  height?: number
}

const PROBE_TIMEOUT = 8000

/**
 * Browser-native metadata probing: HTMLMediaElement for audio/video,
 * Image for pictures. No ffprobe — keeps the wasm core lazily loaded.
 */
export async function probeAsset(file: File, kind: AssetMeta['kind']): Promise<ProbeResult> {
  if (kind === 'other') return {}
  const url = URL.createObjectURL(file)
  try {
    if (kind === 'image') return await probeImage(url)
    return await probeMedia(url, kind)
  } catch {
    return {}
  } finally {
    URL.revokeObjectURL(url)
  }
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('probe timeout')), PROBE_TIMEOUT)),
  ])
}

function probeImage(url: string): Promise<ProbeResult> {
  return withTimeout(
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('image load failed'))
      img.src = url
    }),
  )
}

function probeMedia(url: string, kind: 'video' | 'audio'): Promise<ProbeResult> {
  return withTimeout(
    new Promise((resolve, reject) => {
      const el = document.createElement(kind) as HTMLVideoElement
      el.preload = 'metadata'
      el.onloadedmetadata = () => {
        resolve({
          duration: Number.isFinite(el.duration) ? el.duration : undefined,
          width: kind === 'video' ? el.videoWidth || undefined : undefined,
          height: kind === 'video' ? el.videoHeight || undefined : undefined,
        })
      }
      el.onerror = () => reject(new Error('media load failed'))
      el.src = url
    }),
  )
}
