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

// Explode offsets in SCENE coords [X, Y(up), Z(depth)]
const EXPLODE = [
  [0, -200, 0],     // 0: legs down
  [0, 80, 0],       // 1: seat up
  [0, 220, -160],   // 2: back cushion up+back
  [0, 170, -130],   // 3: back frame up+back
  [150, 100, 0],    // 4: armrests outward (left gets negated)
]

// Split a single geometry into per-region geometries (for explode rendering)
function buildRegionGeos(baseGeo, regions) {
  const srcPos = baseGeo.getAttribute('position')
  const srcIdx = baseGeo.getIndex()
  const regionFaces = [[], [], [], [], []]

  if (srcIdx) {
    for (let i = 0; i < srcIdx.count; i += 3) {
      const a = srcIdx.getX(i), b = srcIdx.getX(i + 1), c = srcIdx.getX(i + 2)
      const ra = regions[a], rb = regions[b], rc = regions[c]
      const r = ra === rb ? ra : ra === rc ? ra : rb === rc ? rb : ra
      regionFaces[r].push(a, b, c)
    }
  }

  const geos = []
  for (let r = 0; r < 5; r++) {
    const faces = regionFaces[r]
    if (!faces.length) { geos.push(null); continue }
    const vmap = new Map(), verts = [], norms = [], idxs = []
    for (const oi of faces) {
      if (!vmap.has(oi)) {
        const ni = verts.length / 3
        vmap.set(oi, ni)
        verts.push(srcPos.getX(oi), srcPos.getY(oi), srcPos.getZ(oi))
        const n = baseGeo.getAttribute('normal')
        if (n) norms.push(n.getX(oi), n.getY(oi), n.getZ(oi))
      }
      idxs.push(vmap.get(oi))
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    if (norms.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3))
    g.setIndex(idxs)
    g.computeVertexNormals()
    g.userData = { region: r, vertexMap: vmap }
    geos.push(g)
  }
  return geos
}

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

      for (let i = 0; i < pos.count; i++) {
        regions[i] = classifyVertex((pos.getX(i) - bb.min.x) / w, (pos.getY(i) - bb.min.y) / d, (pos.getZ(i) - bb.min.z) / h)
      }

      const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2
      const seatTopZ = bb.min.z + h * 0.56

      // Spine calc
      let tyS = 0, tzS = 0, tc = 0
      for (let i = 0; i < pos.count; i++) {
        if (regions[i] >= 2 && regions[i] <= 3 && (pos.getZ(i) - bb.min.z) / h > 0.9) { tyS += pos.getY(i); tzS += pos.getZ(i); tc++ }
      }
      const spineBottomY = bb.min.y + d * 0.65, spineBottomZ = seatTopZ
      const spineDY = (tc > 0 ? tyS / tc : bb.max.y) - spineBottomY
      const spineDZ = (tc > 0 ? tzS / tc : bb.max.z) - spineBottomZ

      // Build region sub-geos for explode
      const regionGeos = buildRegionGeos(geo, regions)

      // Detect left/right armrest vertices for explode direction
      const armLeftRight = new Uint8Array(pos.count) // 0=left, 1=right
      for (let i = 0; i < pos.count; i++) {
        armLeftRight[i] = (pos.getX(i) - bb.min.x) / w < 0.5 ? 0 : 1
      }

      setChairData({ geo, base, regions, bb, cx, cy, seatTopZ, w, d, h,
        spineBottomY, spineBottomZ, spineDY, spineDZ, regionGeos, armLeftRight })
    })
  }, [fbxUrl])

  // Morph vertices
  useEffect(() => {
    if (!chairData) return
    const { geo, base, regions, bb, cx, cy, seatTopZ, w, d, h,
      spineBottomY, spineBottomZ, spineDY, spineDZ, regionGeos } = chairData

    const scW = dimensions.seatWidth / 460, scD = dimensions.seatDepth / 420
    const scHip = dimensions.hipPointHeight / 440, scBack = dimensions.backrestHeight / 480
    const og = sliders.organicGeo, sc = sliders.simpleComplex, as = sliders.abstractStructural
    const hipOffset = (scHip - 1) * (seatTopZ - bb.min.z)

    // Morph the main geometry
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2]
      const region = regions[i]
      const nz = (z - bb.min.z) / h, nx = (x - bb.min.x) / w, ny = (y - bb.min.y) / d

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

      // Direction morphs
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

      pos.setXYZ(i, x, y, z)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()

    // Copy morphed positions into region sub-geos
    for (const rg of regionGeos) {
      if (!rg) continue
      const rPos = rg.getAttribute('position')
      for (const [oldIdx, newIdx] of rg.userData.vertexMap) {
        rPos.setXYZ(newIdx, pos.getX(oldIdx), pos.getY(oldIdx), pos.getZ(oldIdx))
      }
      rPos.needsUpdate = true
      rg.computeVertexNormals()
    }
  }, [chairData, dimensions, sliders])

  useEffect(() => { if (sceneRef) sceneRef.current = groupRef.current })

  if (!chairData) return <group ref={groupRef}><mesh><boxGeometry args={[30,30,30]} /><meshStandardMaterial color="#333" wireframe /></mesh></group>

  const { geo, regionGeos, cx, cy, bb, armLeftRight } = chairData
  const basePos = [-cx * 8, -bb.min.z * 8, -cy * 8]
  const rot = [-Math.PI / 2, 0, 0]
  const sc = [8, 8, 8]

  const matProps = { roughness: 0.48, metalness: 0.05, clearcoat: 0.1, side: THREE.DoubleSide }

  // ── NORMAL MODE (no explode): single mesh ──
  if (!exploded) {
    return (
      <group ref={groupRef}>
        {renderMode !== 'wireframe' && (
          <mesh geometry={geo} castShadow receiveShadow rotation={rot} scale={sc} position={basePos}>
            <meshPhysicalMaterial color="#7a9ab8" {...matProps} />
          </mesh>
        )}
        {renderMode === 'shadedEdge' && (
          <mesh geometry={geo} rotation={rot} scale={sc} position={basePos}>
            <meshBasicMaterial color="#000" wireframe transparent opacity={0.1} side={THREE.DoubleSide} />
          </mesh>
        )}
        {renderMode === 'wireframe' && (
          <>
            <mesh geometry={geo} rotation={rot} scale={sc} position={basePos}>
              <meshBasicMaterial color="#3a4a5a" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh geometry={geo} rotation={rot} scale={sc} position={basePos}>
              <meshBasicMaterial color="#5a8aaa" wireframe transparent opacity={0.35} />
            </mesh>
          </>
        )}
      </group>
    )
  }

  // ── EXPLODE MODE: separate meshes per region with group offsets ──
  return (
    <group ref={groupRef}>
      {regionGeos.map((rg, idx) => {
        if (!rg) return null
        let [ox, oy, oz] = EXPLODE[idx] || [0, 0, 0]
        // Armrests: left side gets negative X
        if (idx === 4) {
          // We can't easily split left/right sub-mesh, so keep X offset as-is
          // The armrests will move together
        }

        return (
          <group key={idx} position={[ox, oy, oz]}>
            {renderMode !== 'wireframe' && (
              <mesh geometry={rg} castShadow receiveShadow rotation={rot} scale={sc} position={basePos}>
                <meshPhysicalMaterial color="#7a9ab8" {...matProps} />
              </mesh>
            )}
            {renderMode === 'shadedEdge' && (
              <mesh geometry={rg} rotation={rot} scale={sc} position={basePos}>
                <meshBasicMaterial color="#000" wireframe transparent opacity={0.1} side={THREE.DoubleSide} />
              </mesh>
            )}
            {renderMode === 'wireframe' && (
              <>
                <mesh geometry={rg} rotation={rot} scale={sc} position={basePos}>
                  <meshBasicMaterial color="#3a4a5a" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
                <mesh geometry={rg} rotation={rot} scale={sc} position={basePos}>
                  <meshBasicMaterial color="#5a8aaa" wireframe transparent opacity={0.35} />
                </mesh>
              </>
            )}
          </group>
        )
      })}
    </group>
  )
}
