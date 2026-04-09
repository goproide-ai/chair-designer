import { useState, useRef, useCallback } from 'react'
import './ImageAnalysisTab.css'

function analyzeImage(imageData, canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data

  // Sample colors
  const colors = []
  const step = Math.max(1, Math.floor(data.length / (4 * 2000))) // sample ~2000 pixels
  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
    if (a < 128) continue
    colors.push([r, g, b])
  }

  // K-means clustering for dominant colors (simplified)
  const clusters = kMeansColors(colors, 5)

  // Compute overall metrics
  let totalBrightness = 0
  let totalWarmth = 0
  let totalSaturation = 0

  for (const [r, g, b] of colors) {
    totalBrightness += (r + g + b) / (3 * 255)
    totalWarmth += (r - b) / 255
    const max = Math.max(r, g, b) / 255
    const min = Math.min(r, g, b) / 255
    totalSaturation += max > 0 ? (max - min) / max : 0
  }

  const n = colors.length || 1

  return {
    dominantColors: clusters.map(c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`),
    dominantColor: `#${clusters[0].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
    brightness: totalBrightness / n,
    warmth: totalWarmth / n,
    saturation: totalSaturation / n,
  }
}

function kMeansColors(colors, k) {
  if (colors.length === 0) return Array(k).fill([128, 128, 128])

  // Initialize centroids randomly
  let centroids = []
  const used = new Set()
  for (let i = 0; i < k; i++) {
    let idx
    do { idx = Math.floor(Math.random() * colors.length) } while (used.has(idx) && used.size < colors.length)
    used.add(idx)
    centroids.push([...colors[idx]])
  }

  for (let iter = 0; iter < 10; iter++) {
    const clusters = Array.from({ length: k }, () => [])

    for (const c of colors) {
      let minDist = Infinity, minIdx = 0
      for (let j = 0; j < k; j++) {
        const d = (c[0] - centroids[j][0]) ** 2 + (c[1] - centroids[j][1]) ** 2 + (c[2] - centroids[j][2]) ** 2
        if (d < minDist) { minDist = d; minIdx = j }
      }
      clusters[minIdx].push(c)
    }

    for (let j = 0; j < k; j++) {
      if (clusters[j].length === 0) continue
      centroids[j] = [
        clusters[j].reduce((s, c) => s + c[0], 0) / clusters[j].length,
        clusters[j].reduce((s, c) => s + c[1], 0) / clusters[j].length,
        clusters[j].reduce((s, c) => s + c[2], 0) / clusters[j].length,
      ]
    }
  }

  // Sort by cluster size (largest first)
  return centroids
}

export default function ImageAnalysisTab({ onImageAnalyzed }) {
  const [preview, setPreview] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [dragging, setDragging] = useState(false)
  const canvasRef = useRef(document.createElement('canvas'))
  const fileRef = useRef()

  const processImage = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        setPreview(e.target.result)

        const canvas = canvasRef.current
        const maxSize = 200
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        const result = analyzeImage(null, canvas)
        setAnalysis(result)
        onImageAnalyzed(result)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }, [onImageAnalyzed])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) processImage(file)
  }, [processImage])

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0]
    if (file) processImage(file)
  }, [processImage])

  const handleClear = useCallback(() => {
    setPreview(null)
    setAnalysis(null)
    onImageAnalyzed(null)
  }, [onImageAnalyzed])

  return (
    <div className="image-tab">
      <h2>Image Influence</h2>
      <p className="image-tab-desc">
        Upload a reference image to extract colors and mood for the chair design.
      </p>

      {!preview ? (
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div className="drop-icon">+</div>
          <span>Drop image here or click to upload</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        <div className="image-preview-container">
          <img src={preview} alt="Reference" className="image-preview" />
          <button className="clear-btn" onClick={handleClear}>Remove</button>

          {analysis && (
            <div className="analysis-results">
              <div className="color-palette">
                {analysis.dominantColors.map((color, i) => (
                  <div
                    key={i}
                    className="color-swatch"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="analysis-metrics">
                <div className="metric">
                  <span>Brightness</span>
                  <div className="metric-bar">
                    <div style={{ width: `${analysis.brightness * 100}%` }} />
                  </div>
                </div>
                <div className="metric">
                  <span>Warmth</span>
                  <div className="metric-bar">
                    <div style={{ width: `${(analysis.warmth + 1) * 50}%` }} />
                  </div>
                </div>
                <div className="metric">
                  <span>Saturation</span>
                  <div className="metric-bar">
                    <div style={{ width: `${analysis.saturation * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
