import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import ParameterPanel from './components/ParameterPanel'
import FBXChairModel from './components/FBXChairModel'
import ErgoDummy, { analyzeErgonomics } from './components/ErgoDummy'
import ExportPanel from './components/ExportPanel'
import './App.css'

const DEFAULT_SLIDERS = { organicGeo: 0, simpleComplex: 0, abstractStructural: 0 }
const DEFAULT_DIMENSIONS = { hipPointHeight: 440, backrestHeight: 480, seatWidth: 460, seatDepth: 420 }

function BackgroundParticles() {
  const ref = useRef()
  const positions = useMemo(() => {
    const a = new Float32Array(80 * 3)
    for (let i = 0; i < 80; i++) { a[i*3]=(Math.random()-0.5)*3000; a[i*3+1]=Math.random()*1200; a[i*3+2]=(Math.random()-0.5)*3000 }
    return a
  }, [])
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.005 })
  return <points ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" count={80} array={positions} itemSize={3} /></bufferGeometry><pointsMaterial size={2} color="#2a2a40" transparent opacity={0.5} sizeAttenuation /></points>
}

// Convert focal length (mm) to FOV (degrees) for 36mm sensor
function lensToFov(mm) { return 2 * Math.atan(36 / (2 * mm)) * (180 / Math.PI) }

// Camera controller (inside Canvas) — handles FOV + explode zoom
function CameraController({ lensMM, exploded, controlsRef }) {
  const { camera } = useThree()
  const prevExploded = useRef(exploded)
  const animating = useRef(false)
  const targetDist = useRef(0)
  const targetY = useRef(250)

  camera.fov = lensToFov(lensMM)
  camera.updateProjectionMatrix()

  useEffect(() => {
    if (prevExploded.current !== exploded) {
      prevExploded.current = exploded
      targetDist.current = exploded ? 2200 : 900
      targetY.current = exploded ? 350 : 250
      animating.current = true
    }
  }, [exploded])

  useFrame(() => {
    if (!animating.current) return
    const current = camera.position.length()
    const diff = targetDist.current - current
    if (Math.abs(diff) < 5) { animating.current = false; return }
    const dir = camera.position.clone().normalize()
    camera.position.copy(dir.multiplyScalar(current + diff * 0.08))
    // Shift orbit target Y
    if (controlsRef?.current) {
      const t = controlsRef.current.target
      t.y += (targetY.current - t.y) * 0.08
    }
  })

  return null
}

function App() {
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS)
  const [dimensions, setDimensions] = useState(DEFAULT_DIMENSIONS)
  const [activeTab, setActiveTab] = useState('params')
  const [showDummy, setShowDummy] = useState(false)
  const [exploded, setExploded] = useState(false)
  const [renderMode, setRenderMode] = useState('shaded') // shaded | shadedEdge | wireframe
  const [lensMM, setLensMM] = useState(50) // focal length in mm
  const [fbxUrl, setFbxUrl] = useState('/models/chair.fbx')
  const canvasRef = useRef()
  const sceneRef = useRef()
  const fileInputRef = useRef()
  const controlsRef = useRef()

  const ergoIssues = useMemo(() => analyzeErgonomics(dimensions), [dimensions])
  const issueCount = Object.keys(ergoIssues).length

  const handleSliderChange = useCallback((key, value) => setSliders(prev => ({ ...prev, [key]: value })), [])
  const handleDimensionChange = useCallback((key, value) => setDimensions(prev => ({ ...prev, [key]: value })), [])
  const handleReset = useCallback(() => { setSliders(DEFAULT_SLIDERS); setDimensions(DEFAULT_DIMENSIONS); setLensMM(50) }, [])

  const handleFBXUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setFbxUrl(url)
    // Reset params for new model
    setSliders(DEFAULT_SLIDERS)
    setDimensions(DEFAULT_DIMENSIONS)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <h1>ChairGen <span className="ai-badge">AI</span></h1>
          <p className="subtitle">AI-Powered Parametric Chair Design</p>
        </div>
        <div className="header-actions">
          <button className="tool-btn upload-btn" onClick={() => fileInputRef.current?.click()}>
            Upload FBX
          </button>
          <input ref={fileInputRef} type="file" accept=".fbx" onChange={handleFBXUpload} style={{ display: 'none' }} />
          <button className={`tool-btn ${exploded ? 'active' : ''}`} onClick={() => setExploded(v => !v)}>
            Explode
          </button>
          <div className="render-mode-group">
            {[['shaded', 'Shaded'], ['shadedEdge', 'Edge'], ['wireframe', 'Wire']].map(([mode, label]) => (
              <button key={mode} className={`render-mode-btn ${renderMode === mode ? 'active' : ''}`}
                onClick={() => setRenderMode(mode)}>{label}</button>
            ))}
          </div>
          <button className={`tool-btn ${showDummy ? 'active' : ''}`} onClick={() => setShowDummy(v => !v)}>
            Ergo Check
            {showDummy && issueCount > 0 && <span className="issue-badge">{issueCount}</span>}
          </button>
          <button className="tool-btn" onClick={handleReset}>Reset</button>
        </div>
      </header>

      <div className="app-body">
        <aside className="panel-left">
          <div className="tab-bar">
            <button className={`tab-btn ${activeTab === 'params' ? 'active' : ''}`} onClick={() => setActiveTab('params')}>Parameters</button>
            <button className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>Export</button>
          </div>
          <div className="tab-content">
            {activeTab === 'params' && (
              <ParameterPanel sliders={sliders} dimensions={dimensions}
                onSliderChange={handleSliderChange} onDimensionChange={handleDimensionChange} />
            )}
            {activeTab === 'export' && <ExportPanel canvasRef={canvasRef} sceneRef={sceneRef} />}
          </div>
          {showDummy && issueCount > 0 && (
            <div className="ergo-warnings">
              <h3>Ergonomic Issues</h3>
              {Object.entries(ergoIssues).map(([area, msg]) => (
                <div key={area} className="ergo-issue">
                  <span className="ergo-dot" />
                  <div>
                    <strong>{area.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</strong>
                    <p>{msg}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="viewport" ref={canvasRef}>
          {/* Lens slider overlay */}
          <div className="fov-control">
            <span className="fov-label">Lens</span>
            <input type="range" min={18} max={200} value={lensMM}
              onChange={e => setLensMM(Number(e.target.value))}
              className="fov-slider" />
            <span className="fov-value">{lensMM}mm</span>
          </div>

          <Canvas shadows camera={{ position: [600, 500, 600], fov: lensToFov(lensMM), near: 1, far: 15000 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}>
            <CameraController lensMM={lensMM} exploded={exploded} controlsRef={controlsRef} />
            <color attach="background" args={['#0a0a0f']} />
            {/* No fog — causes darkening at telephoto zoom distances */}
            <ambientLight intensity={0.35} />
            <directionalLight position={[500, 800, 400]} intensity={1.8} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
            <directionalLight position={[-300, 400, -200]} intensity={0.3} color="#8090b0" />
            <pointLight position={[0, 200, 500]} intensity={0.2} color="#fff5e6" />

            <FBXChairModel key={fbxUrl} fbxUrl={fbxUrl} dimensions={dimensions} sliders={sliders} exploded={exploded} renderMode={renderMode} sceneRef={sceneRef} />
            <ErgoDummy dimensions={dimensions} visible={showDummy} />

            <Grid args={[4000, 4000]} cellSize={30} cellThickness={0.3} cellColor="#151520"
              sectionSize={150} sectionThickness={0.5} sectionColor="#1e1e30"
              fadeDistance={2500} fadeStrength={1.5} position={[0, -0.5, 0]} infiniteGrid />
            <BackgroundParticles />
            <mesh rotation-x={-Math.PI / 2} position={[0, -1, 0]} receiveShadow>
              <planeGeometry args={[4000, 4000]} />
              <shadowMaterial transparent opacity={0.2} />
            </mesh>
            <OrbitControls ref={controlsRef} makeDefault minDistance={200} maxDistance={8000} target={[0, 250, 0]}
              enableDamping dampingFactor={0.08} rotateSpeed={0.5} />
          </Canvas>
        </main>
      </div>
    </div>
  )
}

export default App
