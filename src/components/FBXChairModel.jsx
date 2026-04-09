import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three-stdlib'

function classifyVertex(nx, ny, nz) {
  if (nz < 0.42) return 0           // LEGS
  if (nz < 0.56) return 1           // SEAT
  if ((nx < 0.12 || nx > 0.88) && nz < 0.78) return 4 // ARMRESTS
  if (ny > 0.6) return nz > 0.65 ? 2 : 3              // BACK
  return 3
}

// Explode offsets in FBX coords (applied to vertices directly)
// These are in FBX units (chair is ~55 wide, ~65 deep, ~91 tall)
const EXPLODE_FBX = [
  [0, 0, -18],     // 0: legs down (Z-up)
  [0, 0, 6],       // 1: seat up
  [0, 6, 16],      // 2: back cushion: back(+Y) and up(+Z)
  [0, 5, 12],      // 3: back frame: back and up (less)
  [0, 0, 6],       // 4: armrests up (X offset handled per-side)
]
const EXPLODE_ARM_X = 8 // FBX units outward per side

export default function FBXChairModel({ fbxUrl, dimensions, sliders, exploded, renderMode = 'shaded', sceneRef }) {
  const groupRef = useRef()
  const [chairData, setChairData] = useState(null)

  // Load FBX
  useEffect(() => {
    setChairData(null)
    const loader = new FBXLoader()
    const url = fbxUrl || '/models/chair.fbx'
    const isDefault = url === '/models/chair.fbx'
    loader.load(url, (fbx) => {
      let chairMesh = null
      if (isDefault) fbx.traverse(c => { if (c.isMesh && c.name === '520_P_Chair_1') chairMesh = c })
      if (!chairMesh) { let mv = 0; fbx.traverse(c => { if (c.isMesh) { const v = c.geometry.getAttribute('position')?.count || 0; if (v > mv) { mv = v; chairMesh = c } } }) }
      if (!chairMesh) return

      const geo = chairMesh.geometry.clone()
      geo.computeBoundingBox()
      const bb = geo.boundingBox
      const pos = geo.getAttribute('position')
      const base = new Float32Array(pos.array)
      const regions = new Uint8Array(pos.count)
      const w = bb.max.x - bb.min.x, d = bb.max.y - bb.min.y, h = bb.max.z - bb.min.z

      // Compute region centers (for per-side armrest detection)
      for (let i = 0; i < pos.count; i++) {
        regions[i] = classifyVertex((pos.getX(i) - bb.min.x) / w, (pos.getY(i) - bb.min.y) / d, (pos.getZ(i) - bb.min.z) / h)
      }

      const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2
      const seatTopZ = bb.min.z + h * 0.56

      // Spine
      let tyS = 0, tzS = 0, tc = 0
      for (let i = 0; i < pos.count; i++) {
        if (regions[i] >= 2 && regions[i] <= 3 && (pos.getZ(i) - bb.min.z) / h > 0.9) { tyS += pos.getY(i); tzS += pos.getZ(i); tc++ }
      }
      const spineBottomY = bb.min.y + d * 0.65, spineBottomZ = seatTopZ
      const spineDY = (tc > 0 ? tyS / tc : bb.max.y) - spineBottomY
      const spineDZ = (tc > 0 ? tzS / tc : bb.max.z) - spineBottomZ

      setChairData({ geo, base, regions, bb, cx, cy, seatTopZ, w, d, h,
        spineBottomY, spineBottomZ, spineDY, spineDZ })
    })
  }, [fbxUrl])

  // Morph + Explode (single pass, always uses single geo)
  useEffect(() => {
    if (!chairData) return
    const { geo, base, regions, bb, cx, cy, seatTopZ, w, d, h,
      spineBottomY, spineBottomZ, spineDY, spineDZ } = chairData

    const scW = dimensions.seatWidth / 460, scD = dimensions.seatDepth / 420
    const scHip = dimensions.hipPointHeight / 440, scBack = dimensions.backrestHeight / 480
    const og = sliders.organicGeo, sc = sliders.simpleComplex, as = sliders.abstractStructural
    const hipOffset = (scHip - 1) * (seatTopZ - bb.min.z)
    const pos = geo.getAttribute('position')

    for (let i = 0; i < pos.count; i++) {
      let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2]
      const region = regions[i]
      const nz = (z - bb.min.z) / h, nx = (x - bb.min.x) / w, ny = (y - bb.min.y) / d

      // ── DIMENSIONS ──
      x = cx + (x - cx) * scW; y = cy + (y - cy) * scD

      if (region === 0) { z = bb.min.z + (z - bb.min.z) * scHip }
      else if (region === 1) { z += hipOffset }
      else if (region === 4) {
        z += hipOffset
        const aZ = seatTopZ + hipOffset
        if (z > aZ) z = aZ + (z - aZ) * (1 + (scBack - 1) * 0.3)
      } else {
        z += hipOffset
        const anchorZ = spineBottomZ + hipOffset
        const anchorY = spineBottomY * scD + cy * (1 - scD)
        const dz = z - anchorZ
        if (dz > 0) {
          const t = dz / spineDZ
          const blend = t < 0.2 ? t / 0.2 : 1
          const eff = 1 + (scBack - 1) * blend
          const localY = y - (anchorY + t * spineDY * scD)
          z = anchorZ + t * eff * spineDZ
          y = (anchorY + t * eff * spineDY * scD) + localY
        }
      }

      // ── DIRECTION MORPHS ──
      if (region === 0) {
        const dx = x - cx, dy = y - cy, lt = nz / 0.42
        if (og < 0) { const s = 1 + (1 - lt) * (-og) * 0.12; x = cx + dx * s; y = cy + dy * s * 0.7 }
        if (og > 0) { const s = 1 - og * 0.08 * (1 - lt); x = cx + dx * s; y = cy + dy * s }
        if (sc > 0) { x = cx + dx * (1 + sc * 0.06); y = cy + dy * (1 + sc * 0.06) }
        if (sc < 0) { x = cx + dx * (1 + sc * 0.04); y = cy + dy * (1 + sc * 0.04) }
      }
      if (region === 1 && og < 0) {
        const cd = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 2
        if (z > bb.min.z + h * 0.49 + hipOffset) z -= (1 - cd ** 2) * (-og) * h * 0.01 * Math.max(0, 1 - cd)
      }
      if ((region === 2 || region === 3) && og < 0) {
        y -= (nx - 0.5) ** 2 * 4 * (-og) * d * 0.02
        y += Math.sin(Math.max(0, (nz - 0.56) / 0.44) * Math.PI) * (-og) * d * 0.01
      }
      if (as < 0) {
        const tw = nz * (-as) * 0.015 * Math.PI, dx = x - cx, dy = y - cy
        x = cx + dx * Math.cos(tw) - dy * Math.sin(tw); y = cy + dx * Math.sin(tw) + dy * Math.cos(tw)
      }

      // ── EXPLODE (in FBX coords, before scene transform) ──
      if (exploded) {
        const off = EXPLODE_FBX[region]
        if (off) { x += off[0]; y += off[1]; z += off[2] }
        if (region === 4) {
          x += (nx < 0.5 ? -EXPLODE_ARM_X : EXPLODE_ARM_X)
        }
      }

      pos.setXYZ(i, x, y, z)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  }, [chairData, dimensions, sliders, exploded])

  useEffect(() => { if (sceneRef) sceneRef.current = groupRef.current })

  if (!chairData) return <group ref={groupRef}><mesh><boxGeometry args={[30,30,30]} /><meshStandardMaterial color="#333" wireframe /></mesh></group>

  const { geo, cx, cy, bb } = chairData
  const basePos = [-cx * 8, -bb.min.z * 8, -cy * 8]
  const rot = [-Math.PI / 2, 0, 0]
  const s = [8, 8, 8]
  const matProps = { roughness: 0.48, metalness: 0.05, clearcoat: 0.1, side: THREE.DoubleSide }

  return (
    <group ref={groupRef}>
      {renderMode !== 'wireframe' && (
        <mesh geometry={geo} castShadow receiveShadow rotation={rot} scale={s} position={basePos}>
          <meshPhysicalMaterial color="#8a80c8" {...matProps} />
        </mesh>
      )}
      {renderMode === 'shadedEdge' && (
        <mesh geometry={geo} rotation={rot} scale={s} position={basePos}>
          <meshBasicMaterial color="#000" wireframe transparent opacity={0.1} side={THREE.DoubleSide} />
        </mesh>
      )}
      {renderMode === 'wireframe' && (
        <>
          <mesh geometry={geo} rotation={rot} scale={s} position={basePos}>
            <meshBasicMaterial color="#3a4a5a" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh geometry={geo} rotation={rot} scale={s} position={basePos}>
            <meshBasicMaterial color="#6a6aaa" wireframe transparent opacity={0.35} />
          </mesh>
        </>
      )}
    </group>
  )
}
