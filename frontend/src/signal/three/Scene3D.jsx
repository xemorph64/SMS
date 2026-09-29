import React, { lazy, Suspense, useEffect, useRef, useState } from 'react'

const CanvasHost = lazy(() => import('./CanvasHost'))

/*
 * Every 3D scene goes through this wrapper:
 *  - no WebGL (common on hardened, GPU-less analyst machines)  -> fallback
 *  - prefers-reduced-motion                                    -> one still frame
 *  - scrolled out of view                                      -> render loop paused
 */

let webglOk = null
export function hasWebGL() {
  if (webglOk !== null) return webglOk
  try {
    const c = document.createElement('canvas')
    webglOk = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    webglOk = false
  }
  return webglOk
}

export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!m) return undefined
    const on = () => setReduce(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduce
}

export default function Scene3D({ children, fallback = null, camera, className = '', style, dpr = [1, 1.75] }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(true)
  const reduce = usePrefersReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return undefined
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '80px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  if (!hasWebGL()) return <div className={className} style={style}>{fallback}</div>

  return (
    <div ref={ref} className={className} style={style}>
      <Suspense fallback={fallback}>
        <CanvasHost
          dpr={dpr}
          camera={camera || { position: [0, 0, 6], fov: 45 }}
          frameloop={reduce ? 'demand' : visible ? 'always' : 'never'}
        >
          {children}
        </CanvasHost>
      </Suspense>
    </div>
  )
}

export { tokenRGB } from './tokens'
