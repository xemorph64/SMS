import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

/*
 * The live background of the whole app: a dot lattice (the wire), a slow
 * interference field drifting through it, and an oscilloscope trace made of
 * dots. The cursor excites nearby dots. `heat` (0..1) is set by whatever
 * screen is showing: 0 for healthy context, 1 when you look at something
 * critical; it shifts the trace toward the signal colour.
 *
 * Raw WebGL (no three.js), DPR capped, paused while the tab is hidden, one
 * still frame under reduced motion, CSS dot-grid fallback without WebGL.
 */

const HeatContext = createContext({ setHeat: () => {} })

export function HeatProvider({ children }) {
  const [heat, setHeat] = useState(0)
  return <HeatContext.Provider value={{ heat, setHeat }}>{children}</HeatContext.Provider>
}

/** Declare how "hot" the current screen is. Resets to calm on unmount. */
export function useHeat(level) {
  const { setHeat } = useContext(HeatContext)
  useEffect(() => {
    setHeat(Math.max(0, Math.min(1, level || 0)))
    return () => setHeat(0)
  }, [level, setHeat])
}

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uHeat;
uniform float uDpr;
uniform vec3 uDot;
uniform vec3 uSig;
uniform vec3 uIce;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec2 px = gl_FragCoord.xy / uDpr;          // CSS pixels
  vec2 res = uRes / uDpr;
  float cell = 22.0;
  vec2 id = floor(px / cell);
  vec2 c = (id + 0.5) * cell;
  vec2 d = px - c;

  // slow interference drifting through the lattice
  float n = fbm(c * 0.0042 + vec2(uTime * 0.03, -uTime * 0.02));
  float band = smoothstep(0.52, 0.78, n);

  // oscilloscope trace: a dotted waveform across the lower third
  float y0 = res.y * 0.30;
  float amp = 26.0 + 30.0 * uHeat;
  float wave = y0 + sin(c.x * 0.012 + uTime * 0.9) * amp
             + sin(c.x * 0.031 - uTime * 1.7) * amp * 0.35 * (0.4 + uHeat)
             + (noise(vec2(c.x * 0.05, uTime * 2.0)) - 0.5) * 40.0 * uHeat;
  float trace = exp(-pow((c.y - wave) / (10.0 + 8.0 * uHeat), 2.0));

  // cursor excitation with an expanding ring
  vec2 m = uMouse;
  float md = length(c - m);
  float near = exp(-md / 150.0);
  float ring = exp(-pow((md - mod(uTime * 180.0, 420.0)) / 18.0, 2.0)) * exp(-md / 320.0);

  float r = 0.75 + band * 0.9 + trace * 1.6 + near * 1.4 + ring * 0.8;
  float dotMask = 1.0 - smoothstep(r - 0.6, r + 0.6, length(d));

  float base = 0.10 + band * 0.22 + near * 0.5;
  vec3 col = uDot * base;
  float a = base;

  vec3 traceCol = mix(uIce, uSig, clamp(uHeat * 1.2, 0.0, 1.0));
  col = mix(col, traceCol, trace * (0.55 + 0.45 * uHeat));
  a = max(a, trace * (0.55 + 0.4 * uHeat));
  col = mix(col, uSig, ring * 0.6);
  a = max(a, ring * 0.5);

  // vignette so content stays readable
  vec2 q = px / res - 0.5;
  float vig = 1.0 - smoothstep(0.35, 0.85, length(q * vec2(1.0, 1.25)));
  a *= dotMask * (0.35 + 0.65 * vig);
  gl_FragColor = vec4(col * a, a);
}
`

function readRGB(name) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--s-${name}`).trim().split(/\s+/).map(Number)
  return raw.length === 3 && raw.every((v) => !Number.isNaN(v)) ? raw.map((v) => v / 255) : [1, 1, 1]
}

export default function SignalField() {
  const canvas = useRef(null)
  const { heat = 0 } = useContext(HeatContext)
  const heatRef = useRef(0)
  const [fallback, setFallback] = useState(false)

  heatRef.current = heat

  useEffect(() => {
    const cv = canvas.current
    const gl = cv?.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true })
    if (!gl) { setFallback(true); return undefined }

    const compile = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFallback(true); return undefined }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const U = (n) => gl.getUniformLocation(prog, n)
    const uRes = U('uRes'), uTime = U('uTime'), uMouse = U('uMouse'), uHeat = U('uHeat'), uDpr = U('uDpr')
    const uDot = U('uDot'), uSig = U('uSig'), uIce = U('uIce')

    const setColors = () => {
      gl.uniform3fv(uDot, readRGB('bone'))
      gl.uniform3fv(uSig, readRGB('signal'))
      gl.uniform3fv(uIce, readRGB('ice'))
    }
    setColors()
    const themeObs = new MutationObserver(setColors)
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const resize = () => {
      cv.width = Math.floor(window.innerWidth * dpr)
      cv.height = Math.floor(window.innerHeight * dpr)
      gl.viewport(0, 0, cv.width, cv.height)
      gl.uniform2f(uRes, cv.width, cv.height)
      gl.uniform1f(uDpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // mouse in CSS px, GL origin bottom-left; eased toward target
    const target = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.5 }
    const mouse = { ...target }
    const onMove = (e) => { target.x = e.clientX; target.y = window.innerHeight - e.clientY }
    window.addEventListener('pointermove', onMove, { passive: true })

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let heatNow = heatRef.current
    let raf
    const t0 = performance.now()
    const frame = (now) => {
      mouse.x += (target.x - mouse.x) * 0.08
      mouse.y += (target.y - mouse.y) * 0.08
      heatNow += (heatRef.current - heatNow) * 0.03
      gl.uniform1f(uTime, (now - t0) / 1000)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.uniform1f(uHeat, heatNow)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const onVis = () => { if (!document.hidden && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame) } }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
      themeObs.disconnect()
    }
  }, [])

  if (fallback) {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{ backgroundImage: 'radial-gradient(rgb(var(--s-bone) / 0.12) 1px, transparent 1.2px)', backgroundSize: '22px 22px' }}
      />
    )
  }
  return <canvas ref={canvas} aria-hidden className="sg-field pointer-events-none fixed inset-0 z-0 h-full w-full" />
}
