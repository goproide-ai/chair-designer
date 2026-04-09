import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three-stdlib'

// Chair FBX bbox: X[-11,44] Y[-33,32] Z[38,129] (Z-up)
// high FBX Y = BACK (backrest), low FBX Y = FRONT

function classifyVertex(nx, ny, nz) {
  if (nz < 0.42) return 0           // LEGS
  if (nz < 0.56) return 1           // SEAT
  if ((nx < 0.12 || nx > 0.88) && nz < 0.78) return 4 // ARMRESTS
  if (ny > 0.6) return nz > 0.65 ? 2 : 3              // BACK
  return 3
}

export default function FBXChairModel({ fbxUrl, dimensions, sliders, sceneRef }) {
  const groupRef = useRef()
  const [chairData, setChairData] = useState(null)

  useEffect(() => {
    setChairData(null)
    const loader = new FBXLoader()
    const url = fbxUrl || '/models/chair.fbx'
    const isDefault = url === '/models/chair.fbx'
    loader.load(url, (fbx) => {
      let chairMesh = null
      if (isDefault) {
        fbx.traverse(c => { if (c.isMesh && c.name === '520_P_Chair_1') chairMesh = c })
      }
      if (!chairMesh) {
        let mv = 0
        fbx.traverse(c => { if (c.isMesh) { const vc = c.geometry.getAttribute('position')?.count || 0; if (vc > mv) { mv = vc; chairMesh = c } } })
      }
      if (!chairMesh) return

      const geo = chairMesh.geometry.clone()
      geo.computeBoundingBox()
      const bb = geo.boundingBox
      const pos = geo.getAttribute('position')
      const base = new Float32Array(pos.array)
      const regions = new Uint8Array(pos.count)
      const w = bb.max.x - bb.min.x
      const d = bb.max.y - bb.min.y
      const h = bb.max.z - bb.min.z

      for (let i = 0; i < pos.count; i++) {
        const nx = (pos.getX(i) - bb.min.x) / w
        const ny = (pos.getY(i) - bb.min.y) / d
        const nz = (pos.getZ(i) - bb.min.z) / h
        regions[i] = classifyVertex(nx, ny, nz)
      }

      const cx = (bb.min.x + bb.max.x) / 2
      const cy = (bb.min.y + bb.max.y) / 2
      const seatTopZ = bb.min.z + h * 0.56

      // Back spine: bottom center → top center of back region
      // Bottom of back spine
      const spineBottomZ = seatTopZ
      const spineBottomY = bb.min.y + d * 0.65
      // Top of back spine: average position of highest back vertices
      let topYsum = 0, topZsum = 0, topCount = 0
      for (let i = 0; i < pos.count; i++) {
        const nz = (pos.getZ(i) - bb.min.z) / h
        if (regions[i] >= 2 && regions[i] <= 3 && nz > 0.9) {
          topYsum += pos.getY(i); topZsum += pos.getZ(i); topCount++
        }
      }
      const spineTopY = topCount > 0 ? topYsum / topCount : bb.max.y
      const spineTopZ = topCount > 0 ? topZsum / topCount : bb.max.z

      setChairData({ geo, base, regions, bb, cx, cy, seatTopZ, w, d, h,
        spineBottomY, spineBottomZ, spineTopY, spineTopZ })
    })
  }, [fbxUrl])

  useEffect(() => {
    if (!chairData) return
    const { geo, base, regions, bb, cx, cy, seatTopZ, w, d, h,
      spineBottomY, spineBottomZ, spineTopY, spineTopZ } = chairData
    const pos = geo.getAttribute('position')
    const count = pos.count

    const scW = dimensions.seatWidth / 460
    const scD = dimensions.seatDepth / 420
    const scHip = dimensions.hipPointHeight / 440
    const scBack = dimensions.backrestHeight / 480

    const og = sliders.organicGeo
    const sc = sliders.simpleComplex
    const as = sliders.abstractStructural

    const legHeight = seatTopZ - bb.min.z
    const hipOffset = (scHip - 1) * legHeight

    // Back spine direction vector (unnormalized)
    const spineDY = spineTopY - spineBottomY  // lean amount in Y
    const spineDZ = spineTopZ - spineBottomZ  // height of back
    // Spine length (for normalization)
    const spineLen = Math.sqrt(spineDY * spineDY + spineDZ * spineDZ)

    for (let i = 0; i < count; i++) {
      let x = base[i * 3]
      let y = base[i * 3 + 1]
      let z = base[i * 3 + 2]
      const region = regions[i]
      const nz = (z - bb.min.z) / h
      const nx = (x - bb.min.x) / w
      const ny = (y - bb.min.y) / d

      // ══════ DIMENSIONS ══════
      x = cx + (x - cx) * scW
      y = cy + (y - cy) * scD

      if (region === 0) {
        // LEGS: stretch from floor
        z = bb.min.z + (z - bb.min.z) * scHip
      } else if (region === 1) {
        // SEAT: shift only
        z = z + hipOffset
      } else if (region === 4) {
        // ARMRESTS: shift + partial height
        z = z + hipOffset
        const armAnchorZ = seatTopZ + hipOffset
        if (z > armAnchorZ) {
          const dz = z - armAnchorZ
          z = armAnchorZ + dz * (1 + (scBack - 1) * 0.3)
        }
      } else {
        // BACK (region 2, 3):
        z = z + hipOffset
        const anchorZ = spineBottomZ + hipOffset
        const anchorY = spineBottomY * scD + cy * (1 - scD)

        const vertDZ = z - anchorZ
        if (vertDZ > 0 && spineLen > 0.1) {
          const t = vertDZ / spineDZ

          // Smooth blend: vertices near the seat-back boundary (t < 0.2)
          // transition gradually from 0% stretch to 100% stretch
          const blendT = t < 0.2 ? t / 0.2 : 1.0 // 0→1 over first 20% of back
          const effectiveScale = 1 + (scBack - 1) * blendT

          const spineY_at_t = anchorY + t * spineDY * scD
          const localY = y - spineY_at_t

          const newT = t * effectiveScale
          z = anchorZ + newT * spineDZ
          y = (anchorY + newT * spineDY * scD) + localY
        }
      }

      // ══════ DESIGN DIRECTION ══════
      if (region === 0) {
        const dx = x - cx, dy = y - cy, legT = nz / 0.42
        if (og < 0) { const s = 1 + (1 - legT) * (-og) * 0.12; x = cx + dx * s; y = cy + dy * s * 0.7 }
        if (og > 0) { const s = 1 - og * 0.08 * (1 - legT); x = cx + dx * s; y = cy + dy * s }
        if (sc > 0) { x = cx + dx * (1 + sc * 0.06); y = cy + dy * (1 + sc * 0.06) }
        if (sc < 0) { x = cx + dx * (1 + sc * 0.04); y = cy + dy * (1 + sc * 0.04) }
      }
      if (region === 1) {
        if (og < 0) {
          const cd = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 2
          const mid = bb.min.z + h * 0.49 + hipOffset
          if (z > mid) z -= (1 - cd ** 2) * (-og) * h * 0.01 * Math.max(0, 1 - cd)
        }
        if (sc !== 0) { const mid = bb.min.z + h * 0.49 + hipOffset; z += Math.sign(z - mid) * sc * h * 0.005 }
      }
      if (region === 2 || region === 3) {
        if (og < 0) {
          const sideAmt = (nx - 0.5) ** 2 * 4 * (-og) * d * 0.02
          y -= sideAmt
          const bt = Math.max(0, (nz - 0.56) / 0.44)
          y += Math.sin(bt * Math.PI) * (-og) * d * 0.01
        }
        if (og > 0) y += (spineBottomY - y) * og * 0.03
        if (sc > 0) y += (y > spineBottomY ? 1 : -1) * sc * d * 0.01
      }
      if (region === 4) {
        if (og < 0) { const at = Math.max(0, Math.min(1, (nz - 0.56) / 0.22)); z += Math.sin(at * Math.PI) * (-og) * h * 0.006 }
        const armSign = nx < 0.5 ? -1 : 1
        if (sc > 0) x += armSign * sc * w * 0.012
        if (sc < 0) x -= armSign * (-sc) * w * 0.008
      }
      if (as < 0) {
        const tw = nz * (-as) * 0.015 * Math.PI, dx = x - cx, dy = y - cy
        x = cx + dx * Math.cos(tw) - dy * Math.sin(tw); y = cy + dx * Math.sin(tw) + dy * Math.cos(tw)
      }
      if (as > 0) { const gw = w * 0.25; x += (Math.round(x / gw) * gw - x) * as * 0.03 }

      pos.setXYZ(i, x, y, z)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  }, [chairData, dimensions, sliders])

  useEffect(() => { if (sceneRef) sceneRef.current = groupRef.current })

  if (!chairData) return <group ref={groupRef}><mesh><boxGeometry args={[30,30,30]} /><meshStandardMaterial color="#333" wireframe /></mesh></group>

  return (
    <group ref={groupRef}>
      <mesh geometry={chairData.geo} castShadow receiveShadow
        rotation={[-Math.PI / 2, 0, 0]} scale={[8, 8, 8]}
        position={[-chairData.cx * 8, -chairData.bb.min.z * 8, -chairData.cy * 8]}>
        <meshPhysicalMaterial color="#c4a87a" roughness={0.48} metalness={0.05} clearcoat={0.1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
