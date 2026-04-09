import { useMemo, useEffect } from 'react'
import * as THREE from 'three'

const PI = Math.PI, HALF_PI = PI / 2

// ── UTILITIES ──

function smoothTube(points3, radius, taperFn = null, segs = 24, radSegs = 12) {
  const pts = points3.map(p => new THREE.Vector3(p[0], p[1], p[2]))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  const baseR = typeof radius === 'number' ? radius : 10
  const geo = new THREE.TubeGeometry(curve, segs, baseR, radSegs, false)

  if (taperFn) {
    const pos = geo.getAttribute('position')
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const r = taperFn(t)
      const center = curve.getPointAt(t)
      for (let j = 0; j <= radSegs; j++) {
        const vi = i * (radSegs + 1) + j
        if (vi >= pos.count) continue
        const vx = pos.getX(vi), vy = pos.getY(vi), vz = pos.getZ(vi)
        const dx = vx - center.x, dy = vy - center.y, dz = vz - center.z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d > 0.01) {
          const s = r / d
          pos.setXYZ(vi, center.x + dx * s, center.y + dy * s, center.z + dz * s)
        }
      }
    }
    pos.needsUpdate = true
  }

  geo.computeVertexNormals()
  return geo
}

function roundedBox(w, h, d, r, wS = 4, hS = 4, dS = 4) {
  const geo = new THREE.BoxGeometry(w, h, d, wS, hS, dS)
  const pos = geo.getAttribute('position')
  const v = new THREE.Vector3()
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r

  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    const ox = Math.max(0, Math.abs(v.x) - hw) * Math.sign(v.x)
    const oy = Math.max(0, Math.abs(v.y) - hh) * Math.sign(v.y)
    const oz = Math.max(0, Math.abs(v.z) - hd) * Math.sign(v.z)
    const dist = Math.sqrt(ox * ox + oy * oy + oz * oz)
    if (dist > 0) {
      const s = r / dist
      pos.setXYZ(i,
        Math.min(Math.abs(v.x), hw) * Math.sign(v.x) + ox * s,
        Math.min(Math.abs(v.y), hh) * Math.sign(v.y) + oy * s,
        Math.min(Math.abs(v.z), hd) * Math.sign(v.z) + oz * s
      )
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

function lerp(a, b, t) { return a + (b - a) * t }

// ── SEAT ──

function buildSeat(p) {
  const { seatWidth: W, seatDepth: D, seatThickness: T, seatDishDepth,
    seatEdgeRadius, seatWaterfall, hipPointHeight: hipH, overallSmooth } = p

  const segs = 28
  const verts = [], idxs = []

  // Top surface
  for (let iz = 0; iz <= segs; iz++) {
    for (let ix = 0; ix <= segs; ix++) {
      const u = ix / segs - 0.5  // -0.5 to 0.5
      const v = iz / segs - 0.5

      let x = u * W, z = v * D

      // Corner rounding
      const cr = p.seatCornerRadius
      if (cr > 0) {
        const ax = Math.abs(u * 2), az = Math.abs(v * 2)
        const cornerDist = Math.sqrt(Math.max(0, ax - (1 - cr / (W / 2))) ** 2 + Math.max(0, az - (1 - cr / (D / 2))) ** 2)
        if (cornerDist > 0) {
          const fade = Math.max(0, 1 - cornerDist * (W / 2) / cr)
          x *= lerp(1, fade, Math.min(1, cornerDist * 3))
          z *= lerp(1, fade, Math.min(1, cornerDist * 3))
        }
      }

      // Concave dish
      const r2 = (u * 2) ** 2 + (v * 2) ** 2
      const dish = -seatDishDepth * Math.max(0, 1 - r2 * 0.8)

      // Waterfall front edge
      const frontDrop = v > 0.35 ? -seatWaterfall * ((v - 0.35) / 0.15) ** 2 : 0

      // Smooth edge falloff
      const edgeDist = Math.max(Math.abs(u * 2), Math.abs(v * 2))
      const edgeFade = edgeDist > 0.92 ? 1 - (edgeDist - 0.92) / 0.08 : 1

      const y = hipH + T / 2 + (dish + frontDrop) * Math.max(0, edgeFade)
      verts.push(x, y, z)
    }
  }

  // Bottom surface
  const bOff = (segs + 1) ** 2
  for (let iz = 0; iz <= segs; iz++) {
    for (let ix = 0; ix <= segs; ix++) {
      const u = ix / segs - 0.5, v = iz / segs - 0.5
      const edgeDist = Math.max(Math.abs(u * 2), Math.abs(v * 2))
      const edgeFade = edgeDist > 0.88 ? Math.max(0, 1 - (edgeDist - 0.88) / 0.12) : 1
      const x = u * W * (0.94 + edgeFade * 0.06)
      const z = v * D * (0.94 + edgeFade * 0.06)
      verts.push(x, hipH - T / 2 + (1 - edgeFade) * T * 0.3, z)
    }
  }

  // Indices (top)
  const s1 = segs + 1
  for (let iz = 0; iz < segs; iz++)
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * s1 + ix
      idxs.push(a, a + s1, a + 1, a + 1, a + s1, a + s1 + 1)
    }
  // Indices (bottom, flipped)
  for (let iz = 0; iz < segs; iz++)
    for (let ix = 0; ix < segs; ix++) {
      const a = bOff + iz * s1 + ix
      idxs.push(a, a + 1, a + s1, a + 1, a + s1 + 1, a + s1)
    }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(idxs)
  geo.computeVertexNormals()
  return geo
}

// ── LEGS ──

function buildLegs(p) {
  const group = new THREE.Group()
  const { hipPointHeight: hipH, seatWidth: W, seatDepth: D, seatThickness: T,
    legCount, legRadius: R, legSquareSize, legIsRound, legSpreadAngle,
    legCurveAmount, legCurveProfile, legTaperRatio,
    isCantilever, isSled } = p

  const seatBot = hipH - T / 2
  const inX = W * 0.4, inZ = D * 0.4
  const spreadRad = (legSpreadAngle * PI) / 180

  if (isCantilever) {
    // C-shaped cantilever (Breuer-style)
    const tubeR = Math.max(12, R)
    for (const side of [-1, 1]) {
      const x = side * inX
      const pts = [
        [x * 1.05, 0, inZ * 0.8],
        [x * 1.05, 0, -inZ * 0.3],
        [x * 0.95, seatBot * 0.15, -inZ * 0.6],
        [x * 0.9,  seatBot * 0.85, -inZ * 0.5],
        [x * 0.95, seatBot, -inZ * 0.1],
        [x, seatBot, inZ * 0.3],
      ]
      group.add(new THREE.Mesh(smoothTube(pts, tubeR, null, 32, 10)))
    }
    return group
  }

  if (isSled) {
    // Sled base: two runners
    const tubeR = Math.max(12, R)
    for (const side of [-1, 1]) {
      const x = side * inX
      const pts = [
        [x, 0, inZ * 0.9],
        [x, 0, -inZ * 0.5],
        [x, seatBot * 0.2, -inZ * 0.6],
        [x, seatBot, -inZ * 0.4],
      ]
      group.add(new THREE.Mesh(smoothTube(pts, tubeR, null, 20, 10)))
      // Vertical riser to seat front
      const pts2 = [
        [x, 0, inZ * 0.8],
        [x, seatBot * 0.3, inZ * 0.7],
        [x, seatBot, inZ * 0.3],
      ]
      group.add(new THREE.Mesh(smoothTube(pts2, tubeR * 0.9, null, 16, 10)))
    }
    return group
  }

  // Standard legs
  const corners = legCount === 3 ? [
    [-inX * 0.8, -inZ * 0.5],
    [inX * 0.8, -inZ * 0.5],
    [0, inZ * 0.7],
  ] : [
    [-inX, -inZ],
    [inX, -inZ],
    [inX, inZ],
    [-inX, inZ],
  ]

  for (const [cx, cz] of corners) {
    const angle = Math.atan2(cz, cx)
    const spreadX = Math.sin(spreadRad) * Math.cos(angle) * hipH * 0.35
    const spreadZ = Math.sin(spreadRad) * Math.sin(angle) * hipH * 0.35

    const botX = cx + spreadX, botZ = cz + spreadZ

    // Build path with curve
    const midY = seatBot * 0.5
    const curveDir = legCurveProfile < 0.5 ? 1 : -1
    const curveOff = legCurveAmount * 40 * curveDir

    const pts = [
      [botX, 0, botZ],
      [lerp(botX, cx, 0.3) + Math.cos(angle) * curveOff, midY * 0.4,
       lerp(botZ, cz, 0.3) + Math.sin(angle) * curveOff],
      [lerp(botX, cx, 0.65), midY,
       lerp(botZ, cz, 0.65)],
      [cx, seatBot, cz],
    ]

    const topR = legIsRound ? R : legSquareSize * 0.5
    const botR = topR * legTaperRatio

    if (legIsRound) {
      const taper = (t) => lerp(botR, topR, t)
      group.add(new THREE.Mesh(smoothTube(pts, topR, taper, 20, 10)))
    } else {
      // Square legs: use rounded box along the path
      const len = seatBot * 1.05
      const geo = roundedBox(legSquareSize, len, legSquareSize, 2)
      const mesh = new THREE.Mesh(geo)
      mesh.position.set((cx + botX) / 2, seatBot / 2, (cz + botZ) / 2)
      const angleX = Math.atan2(spreadZ, hipH)
      const angleZ = -Math.atan2(spreadX, hipH)
      mesh.rotation.set(angleX * 0.4, 0, angleZ * 0.4)
      group.add(mesh)
    }
  }

  return group
}

// ── BACKREST ──

function buildBackrest(p) {
  const group = new THREE.Group()
  const { hipPointHeight: hipH, backrestHeight: backH, seatWidth: W, seatDepth: D,
    seatThickness: T, backLean, backCurveAmount, backWrapAmount,
    backWidth: bW, backThickness: bT, backSlatCount, backTopRail, overallSmooth } = p

  const seatTop = hipH + T / 2
  const backZ = -D / 2

  if (backSlatCount === 0) {
    // Solid curved panel
    const segsX = 20, segsY = 20
    const verts = [], idxs = []

    // Front face
    for (let iy = 0; iy <= segsY; iy++) {
      for (let ix = 0; ix <= segsX; ix++) {
        const u = ix / segsX - 0.5
        const t = iy / segsY
        const x = u * bW * (1 - t * 0.06)
        const y = seatTop + t * backH
        const leanZ = -backLean * backH * Math.sin(t * HALF_PI) * 0.8
        const curveZ = backCurveAmount * 25 * Math.sin(t * PI) * 0.5
        const wrapZ = backWrapAmount * 40 * (u * 2) ** 2
        const z = backZ + leanZ - curveZ + wrapZ
        verts.push(x, y, z)
      }
    }

    // Back face (offset by thickness)
    const fOff = (segsX + 1) * (segsY + 1)
    for (let iy = 0; iy <= segsY; iy++) {
      for (let ix = 0; ix <= segsX; ix++) {
        const vi = iy * (segsX + 1) + ix
        verts.push(verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2] - bT)
      }
    }

    const s1 = segsX + 1
    for (let iy = 0; iy < segsY; iy++)
      for (let ix = 0; ix < segsX; ix++) {
        const a = iy * s1 + ix
        idxs.push(a, a + s1, a + 1, a + 1, a + s1, a + s1 + 1)
        const b = fOff + a
        idxs.push(b, b + 1, b + s1, b + 1, b + s1 + 1, b + s1)
      }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(idxs)
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo))
  } else {
    // Slats
    const slatR = Math.max(8, bT * 0.35)
    for (let s = 0; s < backSlatCount; s++) {
      const frac = backSlatCount === 1 ? 0.5 : s / (backSlatCount - 1)
      const xOff = (frac - 0.5) * bW * 0.75

      const pts = []
      for (let i = 0; i <= 6; i++) {
        const t = i / 6
        const y = seatTop + t * backH
        const leanZ = -backLean * backH * Math.sin(t * HALF_PI) * 0.8
        const curveZ = backCurveAmount * 20 * Math.sin(t * PI) * 0.4
        pts.push([xOff, y, backZ + leanZ - curveZ])
      }

      const taper = (t) => slatR * (1 - t * 0.15)
      group.add(new THREE.Mesh(smoothTube(pts, slatR, taper, 16, 8)))
    }

    // Top rail
    if (backTopRail) {
      const topY = seatTop + backH * 0.95
      const topLean = -backLean * backH * Math.sin(0.95 * HALF_PI) * 0.8
      const railR = slatR * 0.85
      const pts = [
        [-bW * 0.42, topY, backZ + topLean],
        [0, topY + 5, backZ + topLean + backCurveAmount * 8],
        [bW * 0.42, topY, backZ + topLean],
      ]
      group.add(new THREE.Mesh(smoothTube(pts, railR, null, 16, 8)))
    }
  }

  return group
}

// ── ARMRESTS ──

function buildArmrests(p) {
  const group = new THREE.Group()
  if (!p.hasArms) return group

  const { hipPointHeight: hipH, seatWidth: W, seatDepth: D, seatThickness: T,
    backrestHeight: backH, armHeightRatio, armCurve, armThickness,
    armFromBack, backLean, legRadius } = p

  const seatTop = hipH + T / 2
  const armY = seatTop + backH * armHeightRatio
  const armR = Math.max(armThickness / 2, 8)

  for (const side of [-1, 1]) {
    const x = side * (W / 2 - 8)
    const backZ = -D / 2 - backLean * backH * 0.3

    // Support: vertical post from seat to arm height
    const supportBot = [x, seatTop + 5, armFromBack ? -D * 0.25 : D * 0.05]
    const supportTop = [x, armY - armR, armFromBack ? -D * 0.2 : 0]
    const supportR = Math.max(10, armR * 0.65)

    group.add(new THREE.Mesh(
      smoothTube([supportBot, supportTop], supportR, null, 12, 8)
    ))

    // Arm pad: horizontal rail from back toward front
    const armBack = [x, armY, armFromBack ? backZ + 15 : -D * 0.3]
    const armMid = [x, armY + armCurve * 15, -D * 0.05]
    const armFront = [x, armY - 3 - armCurve * 8, D * 0.18]

    const padTaper = p.armPadded
      ? (t) => armR * (0.9 + Math.sin(t * PI) * 0.3)
      : (t) => armR * (1 - Math.abs(t - 0.5) * 0.3)

    group.add(new THREE.Mesh(
      smoothTube([armBack, armMid, armFront], armR, padTaper, 18, 8)
    ))

    // If armFromBack, add a connector strut from backrest to arm
    if (armFromBack) {
      const strutBot = [x * 0.85, seatTop + backH * 0.15, backZ + 10]
      const strutTop = [x, armY - 10, backZ + 20]
      group.add(new THREE.Mesh(
        smoothTube([strutBot, strutTop], supportR * 0.8, null, 10, 8)
      ))
    }
  }

  return group
}

// ── CROSSBARS ──

function buildCrossbars(p) {
  const group = new THREE.Group()
  if (!p.hasCrossbar) return group

  const { hipPointHeight: hipH, seatWidth: W, seatDepth: D, seatThickness: T,
    crossbarHeight, crossbarRadius: cR, legSpreadAngle } = p

  const seatBot = hipH - T / 2
  const y = seatBot * crossbarHeight
  const inX = W * 0.38, inZ = D * 0.38
  const spread = (legSpreadAngle * PI) / 180
  const factor = 1 + Math.sin(spread) * 0.2

  // Front bar
  const frontPts = [
    [-inX * factor, y, inZ * factor],
    [inX * factor, y, inZ * factor],
  ]
  group.add(new THREE.Mesh(smoothTube(frontPts, cR, null, 8, 8)))

  // Side bars
  for (const side of [-1, 1]) {
    const sidePts = [
      [side * inX * factor, y, -inZ * factor],
      [side * inX * factor, y, inZ * factor],
    ]
    group.add(new THREE.Mesh(smoothTube(sidePts, cR, null, 8, 8)))
  }

  // Back bar
  const backPts = [
    [-inX * factor, y, -inZ * factor],
    [inX * factor, y, -inZ * factor],
  ]
  group.add(new THREE.Mesh(smoothTube(backPts, cR, null, 8, 8)))

  return group
}

// ── EXPLODE OFFSETS ──
const EXPLODE = {
  seat: [0, 120, 0],
  legs: [0, -100, 0],
  back: [0, 150, -120],
  arms: [160, 80, 0],
}

// ── MAIN COMPONENT ──

export default function ChairModel({ params, sceneRef, exploded = false }) {
  const chairGroup = useMemo(() => {
    const group = new THREE.Group()
    const m = params.materials

    const mat = (cfg) => new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      clearcoat: cfg.type === 'plastic' ? 0.3 : cfg.type === 'leather' ? 0.15 : 0,
      clearcoatRoughness: 0.4,
    })

    const seatMat = mat(m.seat), legMat = mat(m.leg), backMat = mat(m.back), armMat = mat(m.arm)
    const ex = exploded ? 1 : 0

    // Seat
    const seatGeo = buildSeat(params)
    const seat = new THREE.Mesh(seatGeo, seatMat)
    seat.castShadow = true; seat.receiveShadow = true
    seat.position.set(EXPLODE.seat[0] * ex, EXPLODE.seat[1] * ex, EXPLODE.seat[2] * ex)
    group.add(seat)

    // Legs
    const legsGrp = buildLegs(params)
    legsGrp.traverse(c => { if (c.isMesh) { c.material = legMat; c.castShadow = true } })
    legsGrp.position.set(EXPLODE.legs[0] * ex, EXPLODE.legs[1] * ex, EXPLODE.legs[2] * ex)
    group.add(legsGrp)

    // Backrest
    const backGrp = buildBackrest(params)
    backGrp.traverse(c => { if (c.isMesh) { c.material = backMat; c.castShadow = true } })
    backGrp.position.set(EXPLODE.back[0] * ex, EXPLODE.back[1] * ex, EXPLODE.back[2] * ex)
    group.add(backGrp)

    // Armrests
    const armGrp = buildArmrests(params)
    armGrp.traverse(c => { if (c.isMesh) { c.material = armMat; c.castShadow = true } })
    armGrp.position.set(EXPLODE.arms[0] * ex, EXPLODE.arms[1] * ex, EXPLODE.arms[2] * ex)
    group.add(armGrp)

    // Crossbars
    const crossGrp = buildCrossbars(params)
    crossGrp.traverse(c => { if (c.isMesh) { c.material = legMat; c.castShadow = true } })
    crossGrp.position.set(EXPLODE.legs[0] * ex, EXPLODE.legs[1] * ex, EXPLODE.legs[2] * ex)
    group.add(crossGrp)

    // Explode dashed lines
    if (exploded) {
      const lineMat = new THREE.LineDashedMaterial({
        color: '#6c63ff', dashSize: 15, gapSize: 10, opacity: 0.4, transparent: true,
      })
      const cy = params.hipPointHeight
      for (const off of Object.values(EXPLODE)) {
        if (off[0] === 0 && off[1] === 0 && off[2] === 0) continue
        const pts = [new THREE.Vector3(0, cy, 0), new THREE.Vector3(off[0], cy + off[1], off[2])]
        const lg = new THREE.BufferGeometry().setFromPoints(pts)
        const ln = new THREE.Line(lg, lineMat)
        ln.computeLineDistances()
        group.add(ln)
      }
    }

    return group
  }, [params, exploded])

  useEffect(() => {
    if (sceneRef) sceneRef.current = chairGroup
  }, [chairGroup, sceneRef])

  return <primitive object={chairGroup} />
}
