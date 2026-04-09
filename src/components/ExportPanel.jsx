import { useCallback } from 'react'
import * as THREE from 'three'
import './ExportPanel.css'

// OBJ Exporter
function exportToOBJ(group) {
  let output = '# Chair Designer Export\n# https://chair-designer.app\n\n'
  let vertexOffset = 0

  group.traverse(child => {
    if (!child.isMesh) return

    const geo = child.geometry.clone()

    // Apply world transform
    child.updateWorldMatrix(true, false)
    geo.applyMatrix4(child.matrixWorld)

    const positions = geo.getAttribute('position')
    const normals = geo.getAttribute('normal')
    const index = geo.getIndex()

    if (!positions) return

    output += `o Chair_Part\n`

    // Vertices
    for (let i = 0; i < positions.count; i++) {
      output += `v ${positions.getX(i).toFixed(4)} ${positions.getY(i).toFixed(4)} ${positions.getZ(i).toFixed(4)}\n`
    }

    // Normals
    if (normals) {
      for (let i = 0; i < normals.count; i++) {
        output += `vn ${normals.getX(i).toFixed(4)} ${normals.getY(i).toFixed(4)} ${normals.getZ(i).toFixed(4)}\n`
      }
    }

    // Faces
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i) + 1 + vertexOffset
        const b = index.getX(i + 1) + 1 + vertexOffset
        const c = index.getX(i + 2) + 1 + vertexOffset
        if (normals) {
          output += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`
        } else {
          output += `f ${a} ${b} ${c}\n`
        }
      }
    } else {
      for (let i = 0; i < positions.count; i += 3) {
        const a = i + 1 + vertexOffset
        const b = i + 2 + vertexOffset
        const c = i + 3 + vertexOffset
        output += `f ${a} ${b} ${c}\n`
      }
    }

    vertexOffset += positions.count
    output += '\n'
  })

  return output
}

// STL Exporter (binary)
function exportToSTL(group) {
  const triangles = []

  group.traverse(child => {
    if (!child.isMesh) return

    const geo = child.geometry.clone()
    child.updateWorldMatrix(true, false)
    geo.applyMatrix4(child.matrixWorld)

    const positions = geo.getAttribute('position')
    const index = geo.getIndex()

    if (!positions) return

    const getVertex = (idx) => new THREE.Vector3(
      positions.getX(idx),
      positions.getY(idx),
      positions.getZ(idx)
    )

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = getVertex(index.getX(i))
        const b = getVertex(index.getX(i + 1))
        const c = getVertex(index.getX(i + 2))
        const normal = new THREE.Vector3()
          .crossVectors(
            new THREE.Vector3().subVectors(b, a),
            new THREE.Vector3().subVectors(c, a)
          ).normalize()
        triangles.push({ normal, vertices: [a, b, c] })
      }
    } else {
      for (let i = 0; i < positions.count; i += 3) {
        const a = getVertex(i)
        const b = getVertex(i + 1)
        const c = getVertex(i + 2)
        const normal = new THREE.Vector3()
          .crossVectors(
            new THREE.Vector3().subVectors(b, a),
            new THREE.Vector3().subVectors(c, a)
          ).normalize()
        triangles.push({ normal, vertices: [a, b, c] })
      }
    }
  })

  // Binary STL
  const headerBytes = 80
  const triangleCount = triangles.length
  const bufferLength = headerBytes + 4 + triangleCount * 50
  const buffer = new ArrayBuffer(bufferLength)
  const view = new DataView(buffer)

  // Header
  for (let i = 0; i < headerBytes; i++) view.setUint8(i, 0)
  view.setUint32(headerBytes, triangleCount, true)

  let offset = headerBytes + 4
  for (const tri of triangles) {
    view.setFloat32(offset, tri.normal.x, true); offset += 4
    view.setFloat32(offset, tri.normal.y, true); offset += 4
    view.setFloat32(offset, tri.normal.z, true); offset += 4

    for (const v of tri.vertices) {
      view.setFloat32(offset, v.x, true); offset += 4
      view.setFloat32(offset, v.y, true); offset += 4
      view.setFloat32(offset, v.z, true); offset += 4
    }

    view.setUint16(offset, 0, true); offset += 2
  }

  return buffer
}

// glTF Exporter (simple JSON + embedded buffer)
function exportToGLTF(group) {
  const allPositions = []
  const allIndices = []
  let vertexOffset = 0

  group.traverse(child => {
    if (!child.isMesh) return
    const geo = child.geometry.clone()
    child.updateWorldMatrix(true, false)
    geo.applyMatrix4(child.matrixWorld)

    const positions = geo.getAttribute('position')
    const index = geo.getIndex()
    if (!positions) return

    for (let i = 0; i < positions.count; i++) {
      allPositions.push(positions.getX(i), positions.getY(i), positions.getZ(i))
    }

    if (index) {
      for (let i = 0; i < index.count; i++) {
        allIndices.push(index.getX(i) + vertexOffset)
      }
    } else {
      for (let i = 0; i < positions.count; i++) {
        allIndices.push(i + vertexOffset)
      }
    }

    vertexOffset += positions.count
  })

  // Build binary buffer
  const posArray = new Float32Array(allPositions)
  const idxArray = new Uint32Array(allIndices)
  const posByteLen = posArray.byteLength
  const idxByteLen = idxArray.byteLength
  const totalLen = posByteLen + idxByteLen

  const buffer = new ArrayBuffer(totalLen)
  new Float32Array(buffer, 0, allPositions.length).set(posArray)
  new Uint32Array(buffer, posByteLen, allIndices.length).set(idxArray)

  // Compute bounds
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < allPositions.length; i += 3) {
    minX = Math.min(minX, allPositions[i])
    minY = Math.min(minY, allPositions[i + 1])
    minZ = Math.min(minZ, allPositions[i + 2])
    maxX = Math.max(maxX, allPositions[i])
    maxY = Math.max(maxY, allPositions[i + 1])
    maxZ = Math.max(maxZ, allPositions[i + 2])
  }

  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

  const gltf = {
    asset: { version: '2.0', generator: 'ChairDesigner' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        mode: 4
      }]
    }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: allPositions.length / 3,
        type: 'VEC3',
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ]
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: allIndices.length,
        type: 'SCALAR',
        max: [Math.max(...allIndices)],
        min: [Math.min(...allIndices)]
      }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posByteLen, target: 34962 },
      { buffer: 0, byteOffset: posByteLen, byteLength: idxByteLen, target: 34963 }
    ],
    buffers: [{
      uri: `data:application/octet-stream;base64,${base64}`,
      byteLength: totalLen
    }]
  }

  return JSON.stringify(gltf, null, 2)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ExportPanel({ canvasRef, sceneRef }) {
  const handleExportPNG = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // R3F canvas ref is the root element, get the actual canvas
    const actualCanvas = canvas.querySelector?.('canvas') || canvas
    if (actualCanvas.toDataURL) {
      const dataUrl = actualCanvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'chair-design.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }, [canvasRef])

  const handleExportOBJ = useCallback(() => {
    const group = sceneRef.current
    if (!group) return
    const objStr = exportToOBJ(group)
    const blob = new Blob([objStr], { type: 'text/plain' })
    downloadBlob(blob, 'chair-design.obj')
  }, [sceneRef])

  const handleExportSTL = useCallback(() => {
    const group = sceneRef.current
    if (!group) return
    const buffer = exportToSTL(group)
    const blob = new Blob([buffer], { type: 'application/octet-stream' })
    downloadBlob(blob, 'chair-design.stl')
  }, [sceneRef])

  const handleExportGLTF = useCallback(() => {
    const group = sceneRef.current
    if (!group) return
    const gltfStr = exportToGLTF(group)
    const blob = new Blob([gltfStr], { type: 'model/gltf+json' })
    downloadBlob(blob, 'chair-design.gltf')
  }, [sceneRef])

  return (
    <div className="export-panel">
      <h2>Export</h2>
      <div className="export-buttons">
        <button className="export-btn png" onClick={handleExportPNG}>
          <span className="export-icon">🖼</span>
          <span>PNG</span>
        </button>
        <button className="export-btn obj" onClick={handleExportOBJ}>
          <span className="export-icon">📦</span>
          <span>OBJ</span>
        </button>
        <button className="export-btn stl" onClick={handleExportSTL}>
          <span className="export-icon">🔧</span>
          <span>STL</span>
        </button>
        <button className="export-btn gltf" onClick={handleExportGLTF}>
          <span className="export-icon">🌐</span>
          <span>glTF</span>
        </button>
      </div>
    </div>
  )
}
