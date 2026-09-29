import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'

// The only module that pulls in three.js / R3F; loaded lazily by Scene3D.
export default function CanvasHost({ children, camera, dpr, frameloop }) {
  return (
    <Canvas dpr={dpr} camera={camera} frameloop={frameloop} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  )
}
