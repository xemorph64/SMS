import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { tokenRGB } from './tokens'

/*
 * "The Handshake": the product's thesis in one picture.
 * Mail packets arrive from every direction in cleartext (signal vermilion).
 * The ones that cross the bone TLS shell turn ice: encrypted. A few never get
 * the upgrade and stay vermilion all the way in; that is what the engine hunts.
 */

const PACKETS = 110
const OUTER = 4.4
const SHELL = 1.75
const CORE = 0.92

const fresnelVertex = `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const fresnelFragment = `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uAlpha;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(vN, vV)), uPower);
    gl_FragColor = vec4(uColor, f * uAlpha);
  }
`

function randomUnit() {
  const u = Math.random() * 2 - 1
  const t = Math.random() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return new THREE.Vector3(s * Math.cos(t), s * Math.sin(t), u)
}

export default function HandshakeScene() {
  const root = useRef()
  const shell = useRef()
  const packets = useRef()

  const colors = useMemo(() => {
    const [gr, gg, gb] = tokenRGB('bone')
    const [cr, cg, cb] = tokenRGB('ice')
    const [dr, dg, db] = tokenRGB('signal')
    return {
      gold: new THREE.Color(gr, gg, gb),
      cipher: new THREE.Color(cr, cg, cb),
      danger: new THREE.Color(dr, dg, db),
    }
  }, [])

  // Each packet: direction, current radius, speed, and whether it will be downgraded.
  const state = useMemo(
    () =>
      Array.from({ length: PACKETS }, () => ({
        dir: randomUnit(),
        r: CORE + Math.random() * (OUTER - CORE),
        speed: 0.35 + Math.random() * 0.55,
        stripped: Math.random() < 0.12,
        encrypted: false,
      })),
    [],
  )

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const fresnel = useMemo(
    () => ({
      uColor: { value: colors.gold },
      uPower: { value: 2.4 },
      uAlpha: { value: 0.35 },
    }),
    [colors],
  )

  useFrame((three, delta) => {
    const dt = Math.min(delta, 0.05)
    if (root.current) {
      root.current.rotation.y += dt * 0.06
      // gentle pointer parallax, eased, outside React state
      const p = three.pointer
      root.current.rotation.x += ((p.y * 0.25) - root.current.rotation.x) * 0.04
      root.current.rotation.z += ((-p.x * 0.12) - root.current.rotation.z) * 0.04
    }
    if (shell.current) {
      shell.current.rotation.y -= dt * 0.04
      shell.current.rotation.x += dt * 0.015
    }
    const mesh = packets.current
    if (!mesh) return
    let colorDirty = false
    for (let i = 0; i < PACKETS; i++) {
      const s = state[i]
      s.r -= s.speed * dt * (s.r < SHELL ? 0.55 : 1)
      if (s.r <= CORE) {
        s.dir = randomUnit()
        s.r = OUTER
        s.stripped = Math.random() < 0.12
        if (s.encrypted) {
          s.encrypted = false
          mesh.setColorAt(i, colors.danger)
          colorDirty = true
        }
      }
      if (!s.encrypted && !s.stripped && s.r < SHELL) {
        s.encrypted = true
        mesh.setColorAt(i, colors.cipher)
        colorDirty = true
      }
      const fade = Math.min(1, (OUTER - s.r) / 0.6) // grow in at the edge
      dummy.position.copy(s.dir).multiplyScalar(s.r)
      dummy.lookAt(0, 0, 0)
      dummy.scale.setScalar((s.encrypted ? 0.9 : 1.1) * fade)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (colorDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  // Colour buffer allocated up front (everything starts as cleartext) so the
  // material compiles with instance colours on every driver.
  const initialColors = useMemo(() => {
    const a = new Float32Array(PACKETS * 3)
    for (let i = 0; i < PACKETS; i++) colors.danger.toArray(a, i * 3)
    return a
  }, [colors])

  return (
    <group ref={root}>
      {/* the mail server: an inner lattice core */}
      <mesh>
        <icosahedronGeometry args={[CORE, 1]} />
        <meshBasicMaterial color={colors.cipher} wireframe transparent opacity={0.35} />
      </mesh>
      <mesh>
        <sphereGeometry args={[CORE * 0.55, 32, 32]} />
        <meshBasicMaterial color={colors.cipher} transparent opacity={0.08} />
      </mesh>

      {/* the TLS shell: bone lattice + fresnel rim */}
      <group ref={shell}>
        <mesh>
          <icosahedronGeometry args={[SHELL, 3]} />
          <meshBasicMaterial color={colors.gold} wireframe transparent opacity={0.09} />
        </mesh>
      </group>
      <mesh>
        <sphereGeometry args={[SHELL * 1.01, 64, 64]} />
        <shaderMaterial
          vertexShader={fresnelVertex}
          fragmentShader={fresnelFragment}
          uniforms={fresnel}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* signal orbit */}
      <mesh rotation={[Math.PI / 2.6, 0.3, 0]}>
        <torusGeometry args={[2.75, 0.004, 8, 180]} />
        <meshBasicMaterial color={colors.gold} transparent opacity={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 1.8, -0.5, 0.4]}>
        <torusGeometry args={[3.35, 0.003, 8, 180]} />
        <meshBasicMaterial color={colors.cipher} transparent opacity={0.18} />
      </mesh>

      {/* packets */}
      <instancedMesh ref={packets} args={[null, null, PACKETS]}>
        <instancedBufferAttribute attach="instanceColor" args={[initialColors, 3]} />
        <octahedronGeometry args={[0.045, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
