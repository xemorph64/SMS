import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sparkles } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { tokenRGB } from './tokens'

/*
 * Every session in the capture as a star.
 *   colour  = grade (A safe ... F danger)
 *   size    = AI risk score
 *   radius  = how bad the grade is: healthy traffic sits inside the core shell,
 *             risky sessions drift outward
 *   rings   = Isolation Forest anomaly (pulsing)
 *   arcs    = the capture's link to each session; packets flow outward,
 *             faster for worse grades
 * Stars, arcs and shell are single draw calls with custom shaders; bloom and
 * vignette run only on the dark theme (additive glow washes out on paper).
 */

export const RANK = { 'A+': 0, A: 0.05, B: 0.3, C: 0.5, D: 0.7, E: 0.85, F: 1 }
const CORE_SHELL = 1.35
const INTRO_SECONDS = 2.2

export function gradeToken(letter) {
  if (['A+', 'A'].includes(letter)) return 'safe'
  if (letter === 'B') return 'cipher'
  if (letter === 'C') return 'caution'
  if (letter === 'D') return 'warning'
  if (['E', 'F'].includes(letter)) return 'danger'
  return 'fg-3'
}

/** Current SIGNAL theme ('dark' | 'light'), live. */
function useTheme() {
  const read = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

/** Token as a linear-space THREE.Color (tokens are authored in sRGB). */
const tokenColor = (name) => new THREE.Color().setRGB(...tokenRGB(name), THREE.SRGBColorSpace)

const easeOut = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3)

/* ------------------------------------------------------------------ shaders */

const STAR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform float uScale;
  uniform float uHover;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAnomaly;
  attribute float aIndex;
  attribute float aDelay;
  attribute float aActive;
  varying vec3 vColor;
  varying float vAnomaly;
  varying float vHover;
  varying float vActive;
  varying float vSeed;
  void main() {
    float p = clamp((uIntro - aDelay) / 0.9, 0.0, 1.0);
    p = 1.0 - pow(1.0 - p, 3.0);
    vec4 mv = modelViewMatrix * vec4(position * p, 1.0);
    float hov = 1.0 - step(0.5, abs(aIndex - uHover));
    float twinkle = 0.9 + 0.1 * sin(uTime * 2.3 + aIndex * 1.7);
    float s = aSize * mix(0.6, 1.0, aActive) * (1.0 + hov * 0.12) * twinkle * p;
    gl_PointSize = s * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAnomaly = aAnomaly;
    vHover = hov;
    vActive = aActive;
    vSeed = aIndex;
  }
`

const STAR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uLight;
  uniform vec3 uRing;
  uniform vec3 uInk;
  varying vec3 vColor;
  varying float vAnomaly;
  varying float vHover;
  varying float vActive;
  varying float vSeed;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = length(uv);
    if (d > 1.0) discard;

    // hard core + soft halo; the white-hot centre only on dark
    float core = smoothstep(0.23, 0.17, d);
    float halo = exp(-d * d * 10.0) * mix(0.85, 0.35, uLight);
    vec3 col = mix(vColor, vec3(1.0), core * smoothstep(0.17, 0.0, d) * 0.6 * (1.0 - uLight));
    float a = max(core, halo);

    if (vAnomaly > 0.5) {
      float t = fract(uTime * 0.45 + vSeed * 0.131);
      float r = 0.3 + t * 0.62;
      float pulse = smoothstep(0.04, 0.0, abs(d - r)) * (1.0 - t);
      float fixedRing = smoothstep(0.022, 0.0, abs(d - 0.4)) * 0.9;
      float k = clamp(pulse + fixedRing, 0.0, 1.0);
      col = mix(col, uRing, k);
      a = max(a, k);
    }

    if (vHover > 0.5) {
      float ring = smoothstep(0.018, 0.0, abs(d - 0.5)) * 0.9;
      // four reticle ticks around the hovered star
      float ticks = step(0.56, d) * step(d, 0.68) * (step(abs(uv.x), 0.012) + step(abs(uv.y), 0.012));
      float k = clamp(ring + ticks, 0.0, 1.0);
      col = mix(col, uInk, k);
      a = max(a, k);
    }

    a *= mix(0.1, 1.0, vActive);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`

const ARC_VERT = /* glsl */ `
  uniform float uIntro;
  attribute float aT;
  attribute float aIndex;
  attribute float aDelay;
  attribute float aActive;
  attribute float aSpeed;
  attribute vec3 aColor;
  varying float vT;
  varying float vIndex;
  varying float vShow;
  varying float vActive;
  varying float vSpeed;
  varying vec3 vColor;
  void main() {
    float p = clamp((uIntro - aDelay) / 0.9, 0.0, 1.0);
    p = 1.0 - pow(1.0 - p, 3.0);
    vShow = step(aT, p + 0.001);
    vT = aT;
    vIndex = aIndex;
    vActive = aActive;
    vSpeed = aSpeed;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ARC_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uLight;
  uniform vec3 uBase;
  varying float vT;
  varying float vIndex;
  varying float vShow;
  varying float vActive;
  varying float vSpeed;
  varying vec3 vColor;
  void main() {
    if (vShow < 0.5) discard;
    float hov = 1.0 - step(0.5, abs(vIndex - uHover));
    // a packet (bright head, fading tail) travelling core -> star
    float head = fract(uTime * vSpeed + vIndex * 0.618);
    float dd = vT - head;
    float packet = smoothstep(-0.22, 0.0, dd) * step(dd, 0.0);
    float base = mix(0.16, 0.22, uLight) + hov * 0.5;
    vec3 col = mix(uBase, vColor, clamp(packet + hov, 0.0, 1.0));
    float a = (base + packet * mix(0.9, 0.6, uLight)) * mix(0.05, 1.0, vActive);
    // fade near the core so the centre does not turn into a solid knot
    a *= smoothstep(0.0, 0.18, vT);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`

const SHELL_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform float uScale;
  attribute float aSeed;
  varying float vA;
  void main() {
    float p = 1.0 - pow(1.0 - clamp(uIntro / 1.2, 0.0, 1.0), 3.0);
    vec4 mv = modelViewMatrix * vec4(position * (0.6 + 0.4 * p), 1.0);
    // faint shimmer bands sweeping over the shell
    float band = 0.5 + 0.5 * sin(position.y * 5.0 - uTime * 1.2 + aSeed * 0.2);
    vA = (0.18 + 0.55 * pow(band, 6.0)) * p;
    gl_PointSize = 0.022 * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    if (d > 1.0) discard;
    gl_FragColor = vec4(uColor, vA * smoothstep(1.0, 0.3, d));
    #include <colorspace_fragment>
  }
`

const CORE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    float beat = 0.75 + 0.25 * sin(uTime * 2.4);
    gl_FragColor = vec4(uColor * (0.35 + fres * 1.6 * beat), 0.35 + fres * 0.65);
    #include <colorspace_fragment>
  }
`

const CORE_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

/* ------------------------------------------------------------------ layout */

function layout(sessions) {
  const n = sessions.length
  const golden = Math.PI * (3 - Math.sqrt(5))
  return sessions.map((s, i) => {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    const letter = s.grade?.letter
    const rank = RANK[letter] ?? 0.4
    const anomaly = !!s.ml?.anomaly
    const radius = 1.05 + rank * 1.55 + (anomaly ? 0.45 : 0)
    const risk = typeof s.ml?.risk_score === 'number' ? s.ml.risk_score : rank
    const dir = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r)
    return {
      pos: dir.clone().multiplyScalar(radius),
      dir,
      rank,
      radius: 0.055 + risk * 0.085, // world radius of the visible core
      anomaly,
      token: gradeToken(letter),
      stream: s.tcp_stream,
      // stagger the intro inside-out: healthy first, risky last
      delay: 0.15 + rank * 0.55 + (i / Math.max(n, 1)) * 0.35,
    }
  })
}

/* ------------------------------------------------------------------ pieces */

function useScale() {
  const { size, camera, gl } = useThree()
  // pixels per world unit at distance 1 (drawing-buffer pixels)
  return (size.height * gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
}

function Core({ palette, light }) {
  const wire = useRef()
  const gimbalA = useRef()
  const gimbalB = useRef()
  const mat = useRef()
  useFrame((_, dt) => {
    if (wire.current) { wire.current.rotation.y += dt * 0.35; wire.current.rotation.x += dt * 0.12 }
    if (gimbalA.current) gimbalA.current.rotation.x += dt * 0.6
    if (gimbalB.current) gimbalB.current.rotation.y -= dt * 0.45
    if (mat.current) mat.current.uniforms.uTime.value += dt
  })
  const uniforms = useMemo(() => ({ uColor: { value: palette.cipher }, uTime: { value: 0 } }), [palette])
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.2, 48, 48]} />
        <shaderMaterial
          ref={mat}
          vertexShader={CORE_VERT}
          fragmentShader={CORE_FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={light ? THREE.NormalBlending : THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={wire}>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshBasicMaterial color={palette.bone} wireframe transparent opacity={light ? 0.5 : 0.35} toneMapped={false} />
      </mesh>
      <group ref={gimbalA}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.52, 0.004, 6, 96]} />
          <meshBasicMaterial color={palette.cipher} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      </group>
      <group ref={gimbalB} rotation={[0.9, 0, 0.4]}>
        <mesh>
          <torusGeometry args={[0.62, 0.003, 6, 96, Math.PI * 1.4]} />
          <meshBasicMaterial color={palette.bone} transparent opacity={0.45} toneMapped={false} />
        </mesh>
      </group>
      {!light && <Sparkles count={36} scale={1.6} size={2.2} speed={0.35} opacity={0.7} color={palette.cipher} />}
    </group>
  )
}

function Shell({ palette, introRef, scale }) {
  const mat = useRef()
  const geom = useMemo(() => {
    const count = 1400
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      pos.set([Math.cos(golden * i) * r * CORE_SHELL, y * CORE_SHELL, Math.sin(golden * i) * r * CORE_SHELL], i * 3)
      seed[i] = i
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [])
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntro: { value: 0 }, uScale: { value: 1 }, uColor: { value: palette.cipher } }),
    [palette],
  )
  useFrame((state) => {
    if (!mat.current) return
    mat.current.uniforms.uTime.value = state.clock.elapsedTime
    mat.current.uniforms.uIntro.value = introRef.current
    mat.current.uniforms.uScale.value = scale
  })
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <points geometry={geom}>
      <shaderMaterial ref={mat} vertexShader={SHELL_VERT} fragmentShader={SHELL_FRAG} uniforms={uniforms} transparent depthWrite={false} />
    </points>
  )
}

/** Tilted orbit rings marking the grade bands (healthy / at risk / failing). */
function Bands({ palette }) {
  const ref = useRef()
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.05 })
  const bands = [
    { r: CORE_SHELL, color: palette.safe, opacity: 0.22 },
    { r: 1.05 + 0.5 * 1.55, color: palette.caution, opacity: 0.14 },
    { r: 1.05 + 1.0 * 1.55, color: palette.danger, opacity: 0.18 },
  ]
  return (
    <group ref={ref} rotation={[Math.PI / 2 - 0.28, 0, 0.12]}>
      {bands.map((b) => (
        <mesh key={b.r}>
          <ringGeometry args={[b.r - 0.004, b.r + 0.004, 160]} />
          <meshBasicMaterial color={b.color} transparent opacity={b.opacity} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function Arcs({ nodes, active, palette, introRef, hoverRef, light }) {
  const mat = useRef()
  const SEG = 32
  const geom = useMemo(() => {
    const per = SEG * 2
    const pos = new Float32Array(nodes.length * per * 3)
    const t = new Float32Array(nodes.length * per)
    const idx = new Float32Array(nodes.length * per)
    const delay = new Float32Array(nodes.length * per)
    const speed = new Float32Array(nodes.length * per)
    const color = new Float32Array(nodes.length * per * 3)
    const up = new THREE.Vector3(0, 1, 0)
    const p = new THREE.Vector3()
    nodes.forEach((n, i) => {
      const start = n.dir.clone().multiplyScalar(0.36)
      const end = n.pos.clone().multiplyScalar(1 - n.radius / n.pos.length())
      const side = new THREE.Vector3().crossVectors(n.dir, Math.abs(n.dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize()
      const ctrl = start.clone().lerp(end, 0.5).addScaledVector(side, 0.22 * end.length() * (i % 2 ? 1 : -1))
      const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end)
      const col = palette[n.token]
      for (let s = 0; s < SEG; s++) {
        for (let k = 0; k < 2; k++) {
          const u = (s + k) / SEG
          const v = i * per + s * 2 + k
          curve.getPoint(u, p)
          pos.set([p.x, p.y, p.z], v * 3)
          color.set([col.r, col.g, col.b], v * 3)
          t[v] = u
          idx[v] = i
          delay[v] = n.delay
          speed[v] = 0.18 + n.rank * 0.42
        }
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1))
    g.setAttribute('aIndex', new THREE.BufferAttribute(idx, 1))
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    g.setAttribute('aActive', new THREE.BufferAttribute(new Float32Array(nodes.length * per).fill(1), 1))
    return g
  }, [nodes, palette])

  useEffect(() => {
    const attr = geom.getAttribute('aActive')
    const per = SEG * 2
    nodes.forEach((_, i) => attr.array.fill(active?.[i] === false ? 0 : 1, i * per, (i + 1) * per))
    attr.needsUpdate = true
  }, [geom, active, nodes])
  useEffect(() => () => geom.dispose(), [geom])

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntro: { value: 0 }, uHover: { value: -1 }, uLight: { value: 0 }, uBase: { value: palette['edge-2'] } }),
    [palette],
  )
  useFrame((state) => {
    if (!mat.current) return
    const u = mat.current.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uIntro.value = introRef.current
    u.uHover.value = hoverRef.current ?? -1
    u.uLight.value = light ? 1 : 0
  })

  return (
    <lineSegments geometry={geom}>
      <shaderMaterial
        ref={mat}
        vertexShader={ARC_VERT}
        fragmentShader={ARC_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={light ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </lineSegments>
  )
}

function StarField({ nodes, active, palette, introRef, hoverRef, light, scale }) {
  const mat = useRef()
  const geom = useMemo(() => {
    const n = nodes.length
    const pos = new Float32Array(n * 3)
    const color = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const anomaly = new Float32Array(n)
    const idx = new Float32Array(n)
    const delay = new Float32Array(n)
    nodes.forEach((node, i) => {
      pos.set([node.pos.x, node.pos.y, node.pos.z], i * 3)
      const c = palette[node.token]
      color.set([c.r, c.g, c.b], i * 3)
      size[i] = node.radius * 2 / 0.2 // sprite diameter; the core fills the inner 20%
      anomaly[i] = node.anomaly ? 1 : 0
      idx[i] = i
      delay[i] = node.delay
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aAnomaly', new THREE.BufferAttribute(anomaly, 1))
    g.setAttribute('aIndex', new THREE.BufferAttribute(idx, 1))
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
    g.setAttribute('aActive', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1))
    return g
  }, [nodes, palette])

  useEffect(() => {
    const attr = geom.getAttribute('aActive')
    nodes.forEach((_, i) => { attr.array[i] = active?.[i] === false ? 0 : 1 })
    attr.needsUpdate = true
  }, [geom, active, nodes])
  useEffect(() => () => geom.dispose(), [geom])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntro: { value: 0 },
      uScale: { value: 1 },
      uHover: { value: -1 },
      uLight: { value: 0 },
      uRing: { value: palette.warning },
      uInk: { value: palette.bone },
    }),
    [palette],
  )
  useFrame((state) => {
    if (!mat.current) return
    const u = mat.current.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uIntro.value = introRef.current
    u.uHover.value = hoverRef.current ?? -1
    u.uScale.value = scale
    u.uLight.value = light ? 1 : 0
  })

  return (
    <points geometry={geom} raycast={() => null}>
      <shaderMaterial
        ref={mat}
        vertexShader={STAR_VERT}
        fragmentShader={STAR_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={light ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </points>
  )
}

/** Invisible, generous hit spheres (one instanced draw) so small stars are easy to click. */
function HitTargets({ nodes, active, onHover, onSelect }) {
  const ref = useRef()
  useEffect(() => {
    const m = new THREE.Matrix4()
    nodes.forEach((n, i) => {
      const r = Math.max(0.17, n.radius * 2.2)
      m.makeScale(r, r, r).setPosition(n.pos)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [nodes])
  const usable = (i) => i != null && active?.[i] !== false
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, nodes.length]}
      onPointerMove={(e) => {
        e.stopPropagation()
        const i = usable(e.instanceId) ? e.instanceId : null
        onHover(i)
        document.body.style.cursor = i != null && onSelect ? 'pointer' : ''
      }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}
      onClick={(e) => {
        e.stopPropagation()
        if (!usable(e.instanceId)) return
        document.body.style.cursor = ''
        onSelect?.(nodes[e.instanceId].stream)
      }}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </instancedMesh>
  )
}

/** Dolly the camera in during the intro, then hand over to the orbit controls. */
function IntroDriver({ introRef }) {
  const { camera } = useThree()
  const start = useRef(null)
  const done = useRef(false)
  const still = useRef(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches).current
  useFrame((state) => {
    if (start.current == null) start.current = state.clock.elapsedTime
    // reduced motion renders one still frame: skip straight to the end state
    const t = still ? 1 : (state.clock.elapsedTime - start.current) / INTRO_SECONDS
    introRef.current = Math.min(t * 2, 2) // star delays reach ~1.05, plus a 0.9 ramp
    if (!done.current) {
      const k = easeOut(t)
      camera.position.setLength(THREE.MathUtils.lerp(12, 7.4, k))
      if (t >= 1) done.current = true
    }
  })
  return null
}

const DUST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vA = 0.1 + 0.08 * sin(uTime * 0.8 + aSeed * 12.9);
    // capped so dust drifting near the camera stays a speck, not a blob
    gl_PointSize = min((0.03 + fract(aSeed * 7.31) * 0.04) * uScale / -mv.z, 3.0);
    gl_Position = projectionMatrix * mv;
  }
`

const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    if (d > 1.0) discard;
    gl_FragColor = vec4(uColor, vA * smoothstep(1.0, 0.0, d));
    #include <colorspace_fragment>
  }
`

/** Faint deep-field dust for parallax; kept under the bloom threshold so it never reads as a session. */
function Dust({ palette, scale, light }) {
  const mat = useRef()
  const geom = useMemo(() => {
    const count = 1100
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const v = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(5 + Math.random() * 9)
      pos.set([v.x, v.y, v.z], i * 3)
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [])
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uScale: { value: 1 }, uColor: { value: palette.bone } }), [palette])
  useFrame((state) => {
    if (!mat.current) return
    mat.current.uniforms.uTime.value = state.clock.elapsedTime
    mat.current.uniforms.uScale.value = scale
  })
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <points geometry={geom} raycast={() => null}>
      <shaderMaterial
        ref={mat}
        vertexShader={DUST_VERT}
        fragmentShader={DUST_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={light ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </points>
  )
}

/* ------------------------------------------------------------------ scene */

export default function ConstellationScene({ sessions = [], active, onSelect, onHover }) {
  const theme = useTheme()
  const light = theme === 'light'
  const scale = useScale()
  const introRef = useRef(0)
  const hoverRef = useRef(null)
  const [hovering, setHovering] = useState(false)

  const palette = useMemo(() => {
    const out = {}
    for (const k of ['safe', 'cipher', 'caution', 'warning', 'danger', 'fg-3', 'edge-2', 'bone', 'carbon']) out[k] = tokenColor(k)
    return out
    // theme switch swaps the CSS tokens, so re-read them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  const nodes = useMemo(() => layout(sessions), [sessions])

  const setHover = (i) => {
    if (hoverRef.current === i) return
    hoverRef.current = i
    setHovering(i != null)
    onHover?.(i)
  }

  return (
    <>
      <color attach="background" args={[palette.carbon]} />
      <fog attach="fog" args={[palette.carbon, 9, 18]} />
      <IntroDriver introRef={introRef} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={!hovering}
        autoRotateSpeed={0.45}
        rotateSpeed={0.55}
      />

      <Dust palette={palette} scale={scale} light={light} />

      <Core palette={palette} light={light} />
      <Shell palette={palette} introRef={introRef} scale={scale} />
      <Bands palette={palette} />
      <Arcs nodes={nodes} active={active} palette={palette} introRef={introRef} hoverRef={hoverRef} light={light} />
      <StarField nodes={nodes} active={active} palette={palette} introRef={introRef} hoverRef={hoverRef} light={light} scale={scale} />
      <HitTargets nodes={nodes} active={active} onHover={setHover} onSelect={onSelect} />

      {!light && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={0.3} luminanceSmoothing={0.3} intensity={1.2} radius={0.72} />
          <Vignette offset={0.28} darkness={0.75} eskil={false} />
        </EffectComposer>
      )}
    </>
  )
}
