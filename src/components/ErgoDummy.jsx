import { useMemo } from 'react'
import * as THREE from 'three'

const SKIN = '#d4b896'
const SKIN_DARK = '#c0a080'
const WARN = '#ff3030'

function mat(color, opacity = 0.5) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, metalness: 0, transparent: true, opacity, depthWrite: false })
}

function limb(pts, radius, material, taperFn) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5)
  const geo = new THREE.TubeGeometry(curve, 16, radius, 10, false)
  if (taperFn) {
    const pos = geo.getAttribute('position')
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, r = taperFn(t), c = curve.getPointAt(t)
      for (let j = 0; j <= 10; j++) {
        const vi = i * 11 + j; if (vi >= pos.count) continue
        const dx = pos.getX(vi) - c.x, dy = pos.getY(vi) - c.y, dz = pos.getZ(vi) - c.z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d > 0.01) { const s = r / d; pos.setXYZ(vi, c.x + dx * s, c.y + dy * s, c.z + dz * s) }
      }
    }
    pos.needsUpdate = true
  }
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, material)
}

function ell(pos, rx, ry, rz, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 14), material)
  m.position.set(...pos); m.scale.set(rx, ry, rz); return m
}

function ring(pos, r1, r2) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 24),
    new THREE.MeshBasicMaterial({ color: WARN, transparent: true, opacity: 0.3, side: THREE.DoubleSide }))
  m.position.set(...pos); return m
}

export function analyzeErgonomics(dims) {
  const issues = {}
  const { hipPointHeight: hip, backrestHeight: back, seatWidth: sw, seatDepth: sd } = dims
  if (hip > 500) issues.feet = 'Seat too high — feet cannot reach floor'
  if (hip < 380) { issues.knees = 'Seat too low — knees above hip level'; issues.lowerBack = 'Low seat causes slouching' }
  if (back < 340) issues.upperBack = 'Backrest too short'
  if (back > 680) issues.neck = 'Backrest restricts head movement'
  if (sd > 470) issues.knees = (issues.knees || '') + ' Seat too deep'
  if (sd < 360) issues.thighs = 'Seat too shallow'
  if (sw < 390) issues.hips = 'Seat too narrow'
  return issues
}

export default function ErgoDummy({ dimensions, visible, chairBounds, chairRotation = 0 }) {
  const group = useMemo(() => {
    const g = new THREE.Group()
    if (!visible) return g
    const issues = analyzeErgonomics(dimensions)

    // ── Use chair bounds from FBX loader, or fallback to default ──
    const scHip = dimensions.hipPointHeight / 440
    const defaultBounds = { seatTopY: 392, frontZ: 260, backZ: -260, width: 440 }
    const cb = chairBounds || defaultBounds
    const seatTopY = cb.seatTopY * scHip
    const frontZ = cb.frontZ    // chair front (where knees extend beyond)
    const backZ = cb.backZ      // chair back (where shoulders lean toward)

    // ── HUMAN SITTING ON THE SEAT ──
    const pelvisY = seatTopY + 30     // pelvis CENTER above seat
    const pelvisZ = (frontZ + backZ) * 0.5 * 0.3 + frontZ * 0.15  // slightly front of center

    // Knees: just past the chair's front edge, at hip-joint height
    const kneeY = pelvisY - 25
    const kneeZ = frontZ + 50  // 50 units past the chair front

    // Shins: fixed human lower leg length (~430mm → 310 scene units)
    const shinLen = 372
    const ankleY = kneeY - shinLen
    const ankleZ = kneeZ + 10

    // Spine leans toward -Z (back of chair)
    const waistY = pelvisY + 100
    const waistZ = pelvisZ - 40
    const chestY = pelvisY + 230
    const chestZ = pelvisZ - 70
    const shoulderY = pelvisY + 350
    const shoulderZ = pelvisZ - 85
    const shoulderHW = 130
    const neckTopY = shoulderY + 55
    const headY = neckTopY + 65
    const headZ = shoulderZ + 5

    const wm = (issue) => issue ? mat(WARN, 0.65) : mat(SKIN)

    // ── PELVIS ──
    g.add(ell([0, pelvisY, pelvisZ], 90, 57, 63, wm(issues.hips)))

    // ── TORSO ──
    g.add(limb([[0, pelvisY + 15, pelvisZ], [0, waistY, waistZ]], 38, wm(issues.lowerBack), t => 38 - t * 4))
    g.add(limb([[0, waistY, waistZ], [0, chestY, chestZ]], 36, wm(issues.upperBack), t => 34 + t * 6))
    g.add(limb([[0, chestY, chestZ], [0, shoulderY, shoulderZ]], 35, wm(issues.upperBack), t => 40 - t * 8))

    // ── NECK & HEAD ──
    g.add(limb([[0, shoulderY, shoulderZ], [0, neckTopY, shoulderZ + 3]], 18, wm(issues.neck), t => 18 - t * 3))
    g.add(ell([0, headY, headZ], 55, 68, 55, wm(issues.neck)))
    for (const s of [-1, 1]) g.add(ell([s * 54, headY - 5, headZ], 9, 13, 7, mat(SKIN_DARK, 0.4)))
    g.add(ell([0, headY - 18, headZ + 52], 7, 9, 11, mat(SKIN_DARK, 0.4)))

    // ── SHOULDERS ──
    for (const s of [-1, 1]) g.add(ell([s * shoulderHW, shoulderY - 5, shoulderZ], 28, 22, 26, mat(SKIN)))

    // ── LEGS ──
    for (const s of [-1, 1]) {
      const hx = s * 58

      // Thigh: straight from hip joint down to knee
      g.add(limb([
        [hx, pelvisY - 25, pelvisZ + 10],
        [hx, kneeY, kneeZ]
      ], 30, wm(issues.thighs), t => 30 - t * 5))

      // Knee
      g.add(ell([hx, kneeY, kneeZ], 22, 18, 22, wm(issues.knees)))

      // Shin: knee → ankle (drops to floor)
      g.add(limb([
        [hx, kneeY - 5, kneeZ],
        [hx, kneeY - 80, kneeZ + 5],
        [hx, ankleY + 40, ankleZ],
        [hx, ankleY, ankleZ]
      ], 24, wm(issues.feet), t => 24 - t * 7))

      // Ankle + foot
      g.add(ell([hx, ankleY, ankleZ], 13, 11, 13, wm(issues.feet)))
      const footY = ankleY - 3
      const footMesh = new THREE.Mesh(new THREE.BoxGeometry(42, 14, 90), wm(issues.feet))
      footMesh.position.set(hx, footY, ankleZ + 30)
      g.add(footMesh)
      g.add(ell([hx, footY + 2, ankleZ + 72], 21, 9, 13, wm(issues.feet)))
    }

    // ── ARMS ──
    for (const s of [-1, 1]) {
      const sx = s * shoulderHW, sy = shoulderY - 12, sz = shoulderZ
      const elbX = sx + s * 25, elbY = sy - 200, elbZ = sz + 40
      g.add(limb([[sx, sy, sz], [sx + s * 12, sy - 100, sz + 15], [elbX, elbY, elbZ]], 18, mat(SKIN), t => 18 - t * 3))
      g.add(ell([elbX, elbY, elbZ], 14, 12, 14, mat(SKIN_DARK, 0.4)))

      const wrX = elbX + s * 8, wrY = elbY - 160, wrZ = elbZ + 50
      g.add(limb([[elbX, elbY, elbZ], [elbX + s * 4, elbY - 80, elbZ + 25], [wrX, wrY, wrZ]], 14, mat(SKIN), t => 14 - t * 3))
      g.add(ell([wrX, wrY - 22, wrZ + 8], 16, 26, 8, mat(SKIN_DARK, 0.4)))
      for (let f = 0; f < 4; f++) g.add(ell([wrX + (f - 1.5) * 6.5 * s, wrY - 46, wrZ + 12], 3.5, 11, 2.5, mat(SKIN_DARK, 0.35)))
      g.add(ell([wrX + s * 18, wrY - 12, wrZ + 10], 5, 13, 4, mat(SKIN_DARK, 0.35)))
    }

    // ── WARNINGS ──
    if (issues.lowerBack) { const r = ring([0, waistY, waistZ], 48, 62); r.rotation.x = Math.PI / 2; g.add(r) }
    if (issues.knees) for (const s of [-1, 1]) { const r = ring([s * 58, kneeY, kneeZ], 30, 42); r.rotation.x = -0.3; g.add(r) }
    if (issues.feet) for (const s of [-1, 1]) { const r = ring([s * 58, ankleY + 5, ankleZ], 28, 40); r.rotation.x = -Math.PI / 3; g.add(r) }
    if (issues.upperBack) { const r = ring([0, chestY, chestZ], 46, 60); r.rotation.x = Math.PI / 2; g.add(r) }
    if (issues.hips) { const r = ring([0, pelvisY, pelvisZ], 65, 80); r.rotation.x = Math.PI / 2; g.add(r) }

    // Rotate the whole dummy to match chair rotation
    g.rotation.y = chairRotation

    return g
  }, [dimensions, visible, chairBounds, chairRotation])

  if (!visible) return null
  return <primitive object={group} />
}
