// ── SEEDED RNG ──
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
function lerp(a, b, t) { return a + (b - a) * t }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// ── OPPOSING PAIRS ──
export const OPPOSING_PAIRS = {
  organic: 'geometric', geometric: 'organic',
  complex: 'simple',   simple: 'complex',
  abstract: 'structural', structural: 'abstract',
}

// ── DIRECTION BIAS PROFILES ──
// Each value is [center, spread] — the generator picks center ± spread*random
// All values 0-1 normalized
const DIRECTION_BIAS = {
  organic: {
    legCurve: [0.45, 0.25],    legTaper: [0.6, 0.2],     legSpread: [0.4, 0.15],
    legRoundness: [0.95, 0.05], seatDish: [0.5, 0.3],     seatEdgeRound: [0.7, 0.2],
    seatWaterfall: [0.4, 0.3],  backCurve: [0.55, 0.25],   backWrap: [0.35, 0.25],
    backLean: [0.45, 0.2],      armPresence: [0.35, 0.35],  armCurve: [0.6, 0.25],
    crossbar: [0.2, 0.2],       overallSmooth: [0.8, 0.15],
  },
  geometric: {
    legCurve: [0.05, 0.05],    legTaper: [0.1, 0.1],     legSpread: [0.3, 0.1],
    legRoundness: [0.15, 0.15], seatDish: [0.05, 0.05],   seatEdgeRound: [0.1, 0.1],
    seatWaterfall: [0.05, 0.05],backCurve: [0.05, 0.05],   backWrap: [0.0, 0.0],
    backLean: [0.3, 0.15],      armPresence: [0.5, 0.3],   armCurve: [0.05, 0.05],
    crossbar: [0.5, 0.3],       overallSmooth: [0.15, 0.1],
  },
  complex: {
    legCurve: [0.35, 0.3],     legTaper: [0.4, 0.3],     legSpread: [0.45, 0.2],
    legRoundness: [0.6, 0.35],  seatDish: [0.55, 0.3],    seatEdgeRound: [0.5, 0.3],
    seatWaterfall: [0.4, 0.35], backCurve: [0.5, 0.35],    backWrap: [0.45, 0.35],
    backLean: [0.45, 0.25],     armPresence: [0.75, 0.2],  armCurve: [0.5, 0.35],
    crossbar: [0.55, 0.3],      overallSmooth: [0.5, 0.35],
  },
  simple: {
    legCurve: [0.02, 0.02],    legTaper: [0.05, 0.05],   legSpread: [0.2, 0.1],
    legRoundness: [0.5, 0.45],  seatDish: [0.1, 0.1],     seatEdgeRound: [0.25, 0.15],
    seatWaterfall: [0.0, 0.0],  backCurve: [0.1, 0.1],     backWrap: [0.0, 0.0],
    backLean: [0.3, 0.1],       armPresence: [0.1, 0.1],   armCurve: [0.1, 0.1],
    crossbar: [0.15, 0.15],     overallSmooth: [0.3, 0.2],
  },
  abstract: {
    legCurve: [0.6, 0.35],     legTaper: [0.5, 0.4],     legSpread: [0.6, 0.3],
    legRoundness: [0.7, 0.3],   seatDish: [0.6, 0.35],    seatEdgeRound: [0.6, 0.3],
    seatWaterfall: [0.5, 0.4],  backCurve: [0.65, 0.3],    backWrap: [0.55, 0.35],
    backLean: [0.5, 0.3],       armPresence: [0.5, 0.45],  armCurve: [0.7, 0.25],
    crossbar: [0.3, 0.3],       overallSmooth: [0.75, 0.2],
  },
  structural: {
    legCurve: [0.0, 0.02],     legTaper: [0.0, 0.02],    legSpread: [0.25, 0.1],
    legRoundness: [0.05, 0.05], seatDish: [0.0, 0.02],    seatEdgeRound: [0.08, 0.05],
    seatWaterfall: [0.0, 0.0],  backCurve: [0.02, 0.02],   backWrap: [0.0, 0.0],
    backLean: [0.25, 0.1],      armPresence: [0.55, 0.3],  armCurve: [0.0, 0.02],
    crossbar: [0.7, 0.2],       overallSmooth: [0.05, 0.05],
  },
}

// ── MATERIAL OPTIONS ──
export const MATERIAL_OPTIONS = {
  solidwood: {
    label: 'Solid Wood', desc: 'Oak, walnut, ash hardwood',
    theme: {
      seat: { color: '#c4a87a', roughness: 0.48, metalness: 0.0, type: 'wood' },
      leg:  { color: '#a08558', roughness: 0.45, metalness: 0.0, type: 'wood' },
      back: { color: '#b89868', roughness: 0.46, metalness: 0.0, type: 'wood' },
      arm:  { color: '#a08558', roughness: 0.45, metalness: 0.0, type: 'wood' },
    },
  },
  steel: {
    label: 'Steel', desc: 'Brushed or powder-coated metal',
    theme: {
      seat: { color: '#c8c8c8', roughness: 0.18, metalness: 0.85, type: 'metal' },
      leg:  { color: '#a0a0a0', roughness: 0.15, metalness: 0.9,  type: 'metal' },
      back: { color: '#b8b8b8', roughness: 0.2,  metalness: 0.82, type: 'metal' },
      arm:  { color: '#a0a0a0', roughness: 0.15, metalness: 0.9,  type: 'metal' },
    },
  },
  leather: {
    label: 'Leather', desc: 'Premium aniline leather',
    theme: {
      seat: { color: '#4a3020', roughness: 0.4, metalness: 0.0, type: 'leather' },
      leg:  { color: '#888888', roughness: 0.2, metalness: 0.7, type: 'metal' },
      back: { color: '#4a3020', roughness: 0.4, metalness: 0.0, type: 'leather' },
      arm:  { color: '#4a3020', roughness: 0.4, metalness: 0.0, type: 'leather' },
    },
  },
  fabric: {
    label: 'Fabric', desc: 'Woven textile upholstery',
    theme: {
      seat: { color: '#7a8a7a', roughness: 0.82, metalness: 0.0, type: 'fabric' },
      leg:  { color: '#c4a87a', roughness: 0.45, metalness: 0.0, type: 'wood' },
      back: { color: '#7a8a7a', roughness: 0.82, metalness: 0.0, type: 'fabric' },
      arm:  { color: '#7a8a7a', roughness: 0.82, metalness: 0.0, type: 'fabric' },
    },
  },
}

// Auto material palettes (when no user override)
const AUTO_PALETTES = [
  { // Light wood
    seat: { color: '#dfc59f', roughness: 0.45, metalness: 0.0, type: 'wood' },
    leg:  { color: '#c4a87a', roughness: 0.4,  metalness: 0.0, type: 'wood' },
    back: { color: '#d4b88a', roughness: 0.42, metalness: 0.0, type: 'wood' },
    arm:  { color: '#c4a87a', roughness: 0.4,  metalness: 0.0, type: 'wood' },
  },
  { // White plastic + wood
    seat: { color: '#f5f5f0', roughness: 0.3,  metalness: 0.0, type: 'plastic' },
    leg:  { color: '#c4a882', roughness: 0.4,  metalness: 0.05,type: 'wood' },
    back: { color: '#f5f5f0', roughness: 0.3,  metalness: 0.0, type: 'plastic' },
    arm:  { color: '#f0f0ea', roughness: 0.3,  metalness: 0.0, type: 'plastic' },
  },
  { // Dark walnut
    seat: { color: '#6a4a30', roughness: 0.5,  metalness: 0.0, type: 'wood' },
    leg:  { color: '#5a3a22', roughness: 0.48, metalness: 0.0, type: 'wood' },
    back: { color: '#604028', roughness: 0.5,  metalness: 0.0, type: 'wood' },
    arm:  { color: '#5a3a22', roughness: 0.48, metalness: 0.0, type: 'wood' },
  },
  { // Black steel + leather
    seat: { color: '#1a1a1a', roughness: 0.35, metalness: 0.0, type: 'leather' },
    leg:  { color: '#c0c0c0', roughness: 0.15, metalness: 0.85,type: 'metal' },
    back: { color: '#1a1a1a', roughness: 0.35, metalness: 0.0, type: 'leather' },
    arm:  { color: '#2a2a2a', roughness: 0.3,  metalness: 0.0, type: 'leather' },
  },
  { // Grey fabric + black metal
    seat: { color: '#8a9098', roughness: 0.8,  metalness: 0.0, type: 'fabric' },
    leg:  { color: '#2a2a2a', roughness: 0.2,  metalness: 0.8, type: 'metal' },
    back: { color: '#8a9098', roughness: 0.8,  metalness: 0.0, type: 'fabric' },
    arm:  { color: '#8a9098', roughness: 0.8,  metalness: 0.0, type: 'fabric' },
  },
  { // Warm terracotta + brass
    seat: { color: '#c47858', roughness: 0.65, metalness: 0.0, type: 'fabric' },
    leg:  { color: '#b89858', roughness: 0.25, metalness: 0.6, type: 'metal' },
    back: { color: '#c47858', roughness: 0.65, metalness: 0.0, type: 'fabric' },
    arm:  { color: '#b07048', roughness: 0.6,  metalness: 0.0, type: 'fabric' },
  },
  { // Concrete grey
    seat: { color: '#b0b0a8', roughness: 0.7,  metalness: 0.05,type: 'plastic' },
    leg:  { color: '#909088', roughness: 0.6,  metalness: 0.1, type: 'metal' },
    back: { color: '#a8a8a0', roughness: 0.65, metalness: 0.05,type: 'plastic' },
    arm:  { color: '#a0a098', roughness: 0.65, metalness: 0.05,type: 'plastic' },
  },
  { // Deep navy + copper
    seat: { color: '#2a3548', roughness: 0.75, metalness: 0.0, type: 'fabric' },
    leg:  { color: '#c08060', roughness: 0.3,  metalness: 0.5, type: 'metal' },
    back: { color: '#2a3548', roughness: 0.75, metalness: 0.0, type: 'fabric' },
    arm:  { color: '#2a3548', roughness: 0.75, metalness: 0.0, type: 'fabric' },
  },
]

// ── BLEND DIRECTION BIASES ──
function blendBiases(directions, rng) {
  const keys = Object.keys(DIRECTION_BIAS.organic)
  const result = {}

  for (const k of keys) {
    let sumCenter = 0, sumSpread = 0
    for (const dir of directions) {
      const b = DIRECTION_BIAS[dir]?.[k] || [0.5, 0.2]
      sumCenter += b[0]
      sumSpread += b[1]
    }
    const n = directions.length
    const center = sumCenter / n
    const spread = sumSpread / n
    // Generate value: center + spread * (random - 0.5) * 2
    result[k] = clamp(center + spread * (rng() - 0.5) * 2, 0, 1)
  }

  return result
}

// ── MAIN GENERATOR ──
export function generateChairParams(input, seed = 1, imageInfluence = null) {
  const rng = mulberry32(seed * 17389 + 6271)
  const directions = input.designDirections || ['organic']

  // Blend biases from all selected directions
  const p = blendBiases(directions, rng)

  const hipH = input.hipPointHeight
  const backH = input.backrestHeight
  const seatW = input.seatWidth
  const seatD = input.seatDepth

  // ── LEG PARAMS ──
  const legCount = p.overallSmooth > 0.85 ? 3 : 4
  const legRadius = lerp(13, 22, 0.4 + p.legRoundness * 0.3 + rng() * 0.2)
  const legSquareSize = lerp(22, 36, 0.3 + rng() * 0.4)
  const legIsRound = p.legRoundness > 0.3
  const legSpreadAngle = lerp(2, 22, p.legSpread)
  const legCurveAmount = p.legCurve
  const legCurveProfile = rng()   // 0=outward bow, 0.5=S, 1=inward
  const legTaperRatio = lerp(0.55, 1.0, 1 - p.legTaper)  // bottom/top ratio

  // Cantilever: when geometric+structural and low curve
  const isCantilever = p.legCurve < 0.08 && p.legRoundness < 0.2 && rng() > 0.4
  // Sled base: continuous front-back runner
  const isSled = !isCantilever && p.legCurve < 0.05 && p.crossbar > 0.6 && rng() > 0.5

  // ── SEAT PARAMS ──
  const seatThickness = lerp(16, 55, 0.2 + p.seatDish * 0.5 + rng() * 0.15)
  const seatDishDepth = p.seatDish * seatW * 0.08
  const seatEdgeRadius = lerp(3, 30, p.seatEdgeRound)
  const seatWaterfall = p.seatWaterfall * 35  // front edge droop mm
  const seatCornerRadius = lerp(0, seatW * 0.2, p.seatEdgeRound * 0.7 + rng() * 0.3)

  // ── BACK PARAMS ──
  const backLean = lerp(0.06, 0.25, p.backLean)
  const backCurveAmount = p.backCurve
  const backWrapAmount = p.backWrap
  const backWidth = seatW * lerp(0.8, 1.0, 0.5 + rng() * 0.5)
  const backThickness = lerp(14, 40, 0.2 + p.backWrap * 0.4 + rng() * 0.2)
  const backSlatCount = p.overallSmooth > 0.6 ? 0 :    // 0 = solid panel
    p.crossbar > 0.5 ? Math.round(lerp(2, 5, rng())) : // slats
    rng() > 0.5 ? Math.round(lerp(1, 3, rng())) : 0
  const backTopRail = backSlatCount > 1 && rng() > 0.3

  // ── ARM PARAMS ──
  const hasArms = p.armPresence > 0.45
  const armHeightRatio = lerp(0.4, 0.6, 0.3 + rng() * 0.4) // relative to backH
  const armCurve = p.armCurve
  const armThickness = lerp(14, 30, 0.3 + rng() * 0.4)
  const armFromBack = rng() > 0.5 // arm starts from back vs from seat
  const armPadded = p.seatDish > 0.4 && rng() > 0.4

  // ── CROSSBAR ──
  const hasCrossbar = !isCantilever && !isSled && p.crossbar > 0.4
  const crossbarHeight = lerp(0.2, 0.5, rng())
  const crossbarRadius = lerp(5, 10, rng())

  // ── MATERIALS ──
  let materials
  if (input.material && MATERIAL_OPTIONS[input.material]) {
    materials = deepCopy(MATERIAL_OPTIONS[input.material].theme)
  } else {
    const palIdx = Math.floor(rng() * AUTO_PALETTES.length)
    materials = deepCopy(AUTO_PALETTES[palIdx])
  }

  if (imageInfluence) {
    if (imageInfluence.dominantColor) {
      materials.seat.color = imageInfluence.dominantColor
      materials.back.color = imageInfluence.dominantColor
      if (materials.arm) materials.arm.color = imageInfluence.dominantColor
    }
  }

  return {
    hipPointHeight: hipH, backrestHeight: backH, seatWidth: seatW, seatDepth: seatD,
    directions,
    // Legs
    legCount, legRadius, legSquareSize, legIsRound, legSpreadAngle,
    legCurveAmount, legCurveProfile, legTaperRatio,
    isCantilever, isSled,
    // Seat
    seatThickness, seatDishDepth, seatEdgeRadius, seatWaterfall, seatCornerRadius,
    // Back
    backLean, backCurveAmount, backWrapAmount, backWidth, backThickness,
    backSlatCount, backTopRail,
    // Arms
    hasArms, armHeightRatio, armCurve, armThickness, armFromBack, armPadded,
    // Crossbar
    hasCrossbar, crossbarHeight, crossbarRadius,
    // Style
    overallSmooth: p.overallSmooth,
    // Materials
    materials,
  }
}

function deepCopy(obj) {
  const r = {}
  for (const k of Object.keys(obj)) {
    r[k] = typeof obj[k] === 'object' ? { ...obj[k] } : obj[k]
  }
  return r
}
