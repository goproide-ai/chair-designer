import { useMemo, useEffect } from 'react'
import * as THREE from 'three'

const PI = Math.PI, HALF_PI = PI / 2

// ── RNG ──
function rng32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
function lerp(a, b, t) { return a + (b - a) * t }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// ── Smooth tube with taper ──
function tube(pts3, radius, taperFn, segs = 20, rSegs = 10) {
  const pts = pts3.map(p => new THREE.Vector3(p[0], p[1], p[2]))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  const geo = new THREE.TubeGeometry(curve, segs, radius, rSegs, false)
  if (taperFn) {
    const pos = geo.getAttribute('position')
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, r = taperFn(t), c = curve.getPointAt(t)
      for (let j = 0; j <= rSegs; j++) {
        const vi = i * (rSegs + 1) + j
        if (vi >= pos.count) continue
        const dx = pos.getX(vi) - c.x, dy = pos.getY(vi) - c.y, dz = pos.getZ(vi) - c.z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d > 0.01) { const s = r / d; pos.setXYZ(vi, c.x + dx * s, c.y + dy * s, c.z + dz * s) }
      }
    }
    pos.needsUpdate = true
  }
  geo.computeVertexNormals()
  return geo
}

function rbox(w, h, d, r) {
  const geo = new THREE.BoxGeometry(w, h, d, 4, 4, 4)
  const pos = geo.getAttribute('position'), v = new THREE.Vector3()
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    const ox = Math.max(0, Math.abs(v.x) - hw) * Math.sign(v.x)
    const oy = Math.max(0, Math.abs(v.y) - hh) * Math.sign(v.y)
    const oz = Math.max(0, Math.abs(v.z) - hd) * Math.sign(v.z)
    const dist = Math.sqrt(ox * ox + oy * oy + oz * oz)
    if (dist > 0) {
      const s = r / dist
      pos.setXYZ(i, Math.min(Math.abs(v.x), hw) * Math.sign(v.x) + ox * s,
        Math.min(Math.abs(v.y), hh) * Math.sign(v.y) + oy * s,
        Math.min(Math.abs(v.z), hd) * Math.sign(v.z) + oz * s)
    }
  }
  pos.needsUpdate = true; geo.computeVertexNormals()
  return geo
}

// ── BUILD SEAT ──
function buildSeat(p, og, sc) {
  const { seatW, seatD, hipH } = p
  const thickness = lerp(20, 55, (sc + 1) / 2 * 0.5 + 0.25)
  const edgeR = lerp(3, 25, (-og + 1) / 2)
  const dishDepth = lerp(0, seatW * 0.06, (-og + 1) / 2)

  const segs = 24, verts = [], idxs = []
  for (let iz = 0; iz <= segs; iz++) {
    for (let ix = 0; ix <= segs; ix++) {
      const u = ix / segs - 0.5, v = iz / segs - 0.5
      let x = u * seatW, z = v * seatD
      const r2 = (u * 2) ** 2 + (v * 2) ** 2
      const dish = -dishDepth * Math.max(0, 1 - r2 * 0.8)
      const edgeDist = Math.max(Math.abs(u * 2), Math.abs(v * 2))
      const edgeFade = edgeDist > 0.9 ? Math.max(0, 1 - (edgeDist - 0.9) / 0.1) : 1
      // Waterfall front
      const waterfall = v > 0.35 && og < 0 ? -(-og) * 12 * ((v - 0.35) / 0.15) ** 2 : 0
      verts.push(x, hipH + thickness / 2 + (dish + waterfall) * edgeFade, z)
    }
  }
  const bOff = (segs + 1) ** 2
  for (let iz = 0; iz <= segs; iz++)
    for (let ix = 0; ix <= segs; ix++) {
      const u = ix / segs - 0.5, v = iz / segs - 0.5
      const edgeDist = Math.max(Math.abs(u * 2), Math.abs(v * 2))
      const f = edgeDist > 0.85 ? Math.max(0, 1 - (edgeDist - 0.85) / 0.15) : 1
      verts.push(u * seatW * (0.93 + f * 0.07), hipH - thickness / 2 + (1 - f) * thickness * 0.2, v * seatD * (0.93 + f * 0.07))
    }
  const s1 = segs + 1
  for (let iz = 0; iz < segs; iz++) for (let ix = 0; ix < segs; ix++) {
    const a = iz * s1 + ix; idxs.push(a, a + s1, a + 1, a + 1, a + s1, a + s1 + 1)
    const b = bOff + a; idxs.push(b, b + 1, b + s1, b + 1, b + s1 + 1, b + s1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(idxs); geo.computeVertexNormals()
  return { geo, thickness }
}

// ── BUILD LEGS ──
function buildLegs(p, og, sc, as, rand) {
  const grp = new THREE.Group()
  const { seatW, seatD, hipH, seatThickness } = p
  const seatBot = hipH - seatThickness / 2
  const inX = seatW * 0.38, inZ = seatD * 0.38

  // Leg properties from sliders
  const isRound = og < 0.3 || rand() > 0.5
  const radius = clamp(lerp(13, 20, (sc + 1) / 2 * 0.4 + 0.3), 13, 22)
  const sqSize = clamp(lerp(22, 34, (sc + 1) / 2 * 0.3 + 0.3), 22, 34)
  const spreadDeg = lerp(3, 18, (-og + 1) / 2 * 0.5 + as < 0 ? (-as) * 0.3 : 0 + rand() * 0.2)
  const spreadRad = (spreadDeg * PI) / 180
  const curveAmt = clamp(lerp(0, 35, (-og + 1) / 2), 0, 40)
  const taperRatio = lerp(0.6, 1.0, (og + 1) / 2)

  // Cantilever if very geometric + structural
  const cantilever = og > 0.6 && as > 0.4 && rand() > 0.3
  // Sled if geometric + structural alternative
  const sled = !cantilever && og > 0.4 && as > 0.3 && rand() > 0.5

  if (cantilever) {
    const tR = Math.max(12, radius)
    for (const side of [-1, 1]) {
      const x = side * inX
      grp.add(new THREE.Mesh(tube([
        [x * 1.05, 0, inZ * 0.8], [x * 1.05, 0, -inZ * 0.3],
        [x * 0.95, seatBot * 0.15, -inZ * 0.6],
        [x * 0.9, seatBot * 0.85, -inZ * 0.5],
        [x * 0.95, seatBot, -inZ * 0.1], [x, seatBot, inZ * 0.3]
      ], tR, null, 32)))
    }
    return grp
  }

  if (sled) {
    const tR = Math.max(12, radius)
    for (const side of [-1, 1]) {
      const x = side * inX
      grp.add(new THREE.Mesh(tube([
        [x, 0, inZ * 0.9], [x, 0, -inZ * 0.5],
        [x, seatBot * 0.2, -inZ * 0.6], [x, seatBot, -inZ * 0.4]
      ], tR, null, 20)))
      grp.add(new THREE.Mesh(tube([
        [x, 0, inZ * 0.8], [x, seatBot * 0.3, inZ * 0.7], [x, seatBot, inZ * 0.3]
      ], tR * 0.9, null, 16)))
    }
    return grp
  }

  // Standard 4-leg
  const corners = [[-inX, -inZ], [inX, -inZ], [inX, inZ], [-inX, inZ]]

  for (const [cx, cz] of corners) {
    const angle = Math.atan2(cz, cx)
    const spX = Math.sin(spreadRad) * Math.cos(angle) * hipH * 0.35
    const spZ = Math.sin(spreadRad) * Math.sin(angle) * hipH * 0.35
    const botX = cx + spX, botZ = cz + spZ

    // Smooth curve direction
    const curveSide = rand() > 0.5 ? 1 : -1
    const midOff = curveAmt * curveSide

    const pts = [
      [botX, 0, botZ],
      [lerp(botX, cx, 0.35) + Math.cos(angle) * midOff, seatBot * 0.35, lerp(botZ, cz, 0.35) + Math.sin(angle) * midOff],
      [lerp(botX, cx, 0.7), seatBot * 0.7, lerp(botZ, cz, 0.7)],
      [cx, seatBot, cz]
    ]

    if (isRound) {
      const topR = radius, botR = topR * taperRatio
      grp.add(new THREE.Mesh(tube(pts, topR, t => lerp(botR, topR, t), 20, 10)))
    } else {
      const len = Math.sqrt((botX - cx) ** 2 + seatBot ** 2 + (botZ - cz) ** 2)
      const geo = rbox(sqSize, len, sqSize, 2)
      const m = new THREE.Mesh(geo)
      m.position.set((cx + botX) / 2, seatBot / 2, (cz + botZ) / 2)
      m.rotation.set(Math.atan2(spZ, hipH) * 0.35, 0, -Math.atan2(spX, hipH) * 0.35)
      grp.add(m)
    }
  }

  // Crossbar
  if ((og > 0 || sc > 0 || as > 0.3) && rand() > 0.3) {
    const cH = seatBot * lerp(0.25, 0.45, rand())
    const cR = lerp(5, 9, rand())
    const f = 1 + Math.sin(spreadRad) * 0.2
    // Front
    grp.add(new THREE.Mesh(tube([[-inX * f, cH, inZ * f], [inX * f, cH, inZ * f]], cR, null, 8)))
    // Sides
    for (const s of [-1, 1])
      grp.add(new THREE.Mesh(tube([[s * inX * f, cH, -inZ * f], [s * inX * f, cH, inZ * f]], cR, null, 8)))
    // Back
    grp.add(new THREE.Mesh(tube([[-inX * f, cH, -inZ * f], [inX * f, cH, -inZ * f]], cR, null, 8)))
  }

  return grp
}

// ── BUILD BACKREST ──
function buildBack(p, og, sc, as, rand) {
  const grp = new THREE.Group()
  const { seatW, seatD, hipH, backH, seatThickness } = p
  const seatTop = hipH + seatThickness / 2
  const bW = seatW * lerp(0.82, 0.98, rand())
  const bZ = -seatD / 2
  const lean = lerp(0.06, 0.22, rand())
  const thick = clamp(lerp(14, 40, (sc + 1) / 2 * 0.5 + rand() * 0.3), 14, 40)
  const curveAmt = lerp(0, 0.6, (-og + 1) / 2)
  const wrapAmt = lerp(0, 35, (-og + 1) / 2 * 0.7 + rand() * 0.3)

  // Decide: solid panel vs slats
  const useSolid = rand() > 0.4 || og < -0.3
  const slatCount = useSolid ? 0 : Math.round(lerp(2, 5, (sc + 1) / 2 * 0.4 + rand() * 0.3))

  if (useSolid || slatCount === 0) {
    // Solid curved panel
    const sx = 18, sy = 18, vts = [], ids = []
    for (let iy = 0; iy <= sy; iy++) {
      for (let ix = 0; ix <= sx; ix++) {
        const u = ix / sx - 0.5, t = iy / sy
        const x = u * bW * (1 - t * 0.05)
        const y = seatTop + t * backH
        const lz = -lean * backH * Math.sin(t * HALF_PI) * 0.8
        const cz = curveAmt * 20 * Math.sin(t * PI) * 0.4
        const wz = wrapAmt * (u * 2) ** 2
        vts.push(x, y, bZ + lz - cz + wz)
      }
    }
    // Back face
    const fO = (sx + 1) * (sy + 1)
    for (let i = 0; i < fO; i++) vts.push(vts[i * 3], vts[i * 3 + 1], vts[i * 3 + 2] - thick)

    const s1 = sx + 1
    for (let iy = 0; iy < sy; iy++) for (let ix = 0; ix < sx; ix++) {
      const a = iy * s1 + ix
      ids.push(a, a + s1, a + 1, a + 1, a + s1, a + s1 + 1)
      const b = fO + a
      ids.push(b, b + 1, b + s1, b + 1, b + s1 + 1, b + s1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vts, 3))
    geo.setIndex(ids); geo.computeVertexNormals()
    grp.add(new THREE.Mesh(geo))
  } else {
    // Slats
    const sR = Math.max(8, thick * 0.35)
    for (let s = 0; s < slatCount; s++) {
      const frac = slatCount === 1 ? 0.5 : s / (slatCount - 1)
      const xOff = (frac - 0.5) * bW * 0.75
      const pts = []
      for (let i = 0; i <= 6; i++) {
        const t = i / 6, y = seatTop + t * backH
        const lz = -lean * backH * Math.sin(t * HALF_PI) * 0.8
        const cz = curveAmt * 15 * Math.sin(t * PI) * 0.35
        pts.push([xOff, y, bZ + lz - cz])
      }
      grp.add(new THREE.Mesh(tube(pts, sR, t => sR * (1 - t * 0.12), 16, 8)))
    }
    // Top rail
    if (slatCount > 1) {
      const topY = seatTop + backH * 0.95
      const tLz = -lean * backH * Math.sin(0.95 * HALF_PI) * 0.8
      grp.add(new THREE.Mesh(tube(
        [[-bW * 0.4, topY, bZ + tLz], [0, topY + 4, bZ + tLz + curveAmt * 6], [bW * 0.4, topY, bZ + tLz]],
        sR * 0.85, null, 16, 8
      )))
    }
  }

  // Abstract twist
  if (as < -0.3) {
    grp.traverse(child => {
      if (!child.isMesh) return
      const pos = child.geometry.getAttribute('position')
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        const nY = (y - seatTop) / backH
        const twist = nY * (-as) * 0.06 * PI
        const px = pos.getX(i), pz = pos.getZ(i) - bZ
        pos.setX(i, px * Math.cos(twist) - pz * Math.sin(twist))
        pos.setZ(i, bZ + px * Math.sin(twist) + pz * Math.cos(twist))
      }
      pos.needsUpdate = true
      child.geometry.computeVertexNormals()
    })
  }

  return grp
}

// ── BUILD ARMRESTS ──
function buildArms(p, og, sc, as, rand) {
  const grp = new THREE.Group()
  const hasArms = sc > -0.3 && rand() > 0.3
  if (!hasArms) return grp

  const { seatW, seatD, hipH, backH, seatThickness } = p
  const seatTop = hipH + seatThickness / 2
  const armH = seatTop + backH * lerp(0.4, 0.55, rand())
  const armR = clamp(lerp(10, 22, (sc + 1) / 2 * 0.3 + rand() * 0.3), 10, 22)
  const lean = lerp(0.06, 0.15, rand())

  for (const side of [-1, 1]) {
    const x = side * (seatW / 2 - 8)
    const backZ = -seatD / 2 - lean * backH * 0.2

    // Vertical support — starts from seat, goes to arm height
    const supBot = [x, seatTop + 5, -seatD * 0.15]
    const supTop = [x, armH - armR, -seatD * 0.1]
    grp.add(new THREE.Mesh(tube([supBot, supTop], armR * 0.6, null, 12, 8)))

    // Arm pad — from back toward front
    const padPts = [
      [x, armH, backZ + 15],
      [x, armH + (og < 0 ? 10 : 0), -seatD * 0.02],
      [x, armH - 3, seatD * 0.18]
    ]
    const padTaper = (t) => armR * (0.85 + Math.sin(t * PI) * 0.25)
    grp.add(new THREE.Mesh(tube(padPts, armR, padTaper, 16, 8)))

    // Back connector strut
    if (rand() > 0.4) {
      grp.add(new THREE.Mesh(tube(
        [[x * 0.85, seatTop + backH * 0.12, backZ + 10], [x, armH - 8, backZ + 18]],
        armR * 0.5, null, 10, 8
      )))
    }
  }

  return grp
}

// ── MATERIALS ──
function makeMaterials(og, sc, rand) {
  const palettes = [
    { seat: '#dfc59f', leg: '#c4a87a', back: '#d4b88a', arm: '#c4a87a' },
    { seat: '#f5f5f0', leg: '#c4a882', back: '#f5f5f0', arm: '#f0f0ea' },
    { seat: '#6a4a30', leg: '#5a3a22', back: '#604028', arm: '#5a3a22' },
    { seat: '#1a1a1a', leg: '#c0c0c0', back: '#1a1a1a', arm: '#2a2a2a' },
    { seat: '#8a9098', leg: '#2a2a2a', back: '#8a9098', arm: '#8a9098' },
    { seat: '#c47858', leg: '#b89858', back: '#c47858', arm: '#b07048' },
    { seat: '#e0e0d8', leg: '#909088', back: '#d8d8d0', arm: '#d0d0c8' },
    { seat: '#2a3548', leg: '#c08060', back: '#2a3548', arm: '#2a3548' },
  ]
  const pal = palettes[Math.floor(rand() * palettes.length)]

  const isMetalLeg = og > 0.3 || rand() > 0.6
  const r = (part) => new THREE.MeshPhysicalMaterial({
    color: pal[part],
    roughness: part === 'leg' && isMetalLeg ? 0.18 : part === 'seat' ? 0.5 : 0.48,
    metalness: part === 'leg' && isMetalLeg ? 0.85 : 0.05,
    clearcoat: 0.1,
    clearcoatRoughness: 0.4,
  })

  return { seat: r('seat'), leg: r('leg'), back: r('back'), arm: r('arm') }
}

// ── MAIN COMPONENT ──
export default function GeneratedChair({ seed, sliders, dimensions, sceneRef }) {
  const group = useMemo(() => {
    const rand = rng32(seed * 17389 + 6271)
    const og = sliders.organicGeo
    const sc = sliders.simpleComplex
    const as = sliders.abstractStructural

    const seatW = dimensions.seatWidth
    const seatD = dimensions.seatDepth
    const hipH = dimensions.hipPointHeight
    const backH = dimensions.backrestHeight

    const { geo: seatGeo, thickness: seatTh } = buildSeat({ seatW, seatD, hipH }, og, sc)
    const params = { seatW, seatD, hipH, backH, seatThickness: seatTh }

    const mats = makeMaterials(og, sc, rand)
    const g = new THREE.Group()

    // Seat
    const seat = new THREE.Mesh(seatGeo, mats.seat)
    seat.castShadow = true; seat.receiveShadow = true
    g.add(seat)

    // Legs
    const legs = buildLegs(params, og, sc, as, rand)
    legs.traverse(c => { if (c.isMesh) { c.material = mats.leg; c.castShadow = true } })
    g.add(legs)

    // Back
    const back = buildBack(params, og, sc, as, rand)
    back.traverse(c => { if (c.isMesh) { c.material = mats.back; c.castShadow = true } })
    g.add(back)

    // Arms
    const arms = buildArms(params, og, sc, as, rand)
    arms.traverse(c => { if (c.isMesh) { c.material = mats.arm; c.castShadow = true } })
    g.add(arms)

    return g
  }, [seed, sliders, dimensions])

  useEffect(() => {
    if (sceneRef) sceneRef.current = group
  }, [group, sceneRef])

  return <primitive object={group} />
}
