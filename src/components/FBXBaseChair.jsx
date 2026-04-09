import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three-stdlib'

export default function FBXBaseChair({ dimensions, sceneRef }) {
  const groupRef = useRef()
  const [loaded, setLoaded] = useState(false)
  const meshRef = useRef()

  useEffect(() => {
    const loader = new FBXLoader()
    loader.load('/models/chair.fbx', (fbx) => {
      let chairMesh = null
      fbx.traverse(child => {
        if (child.isMesh && child.name === '520_P_Chair_1') chairMesh = child
      })
      if (!chairMesh || !groupRef.current) return

      const geo = chairMesh.geometry.clone()
      geo.computeBoundingBox()

      // Use original material colors if available, otherwise default
      const mat = new THREE.MeshPhysicalMaterial({
        color: '#c4a87a',
        roughness: 0.48,
        metalness: 0.05,
        clearcoat: 0.1,
        side: THREE.DoubleSide,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      // FBX Z-up → Y-up
      mesh.rotation.x = -Math.PI / 2
      mesh.scale.set(8, 8, 8)

      // Center the chair
      geo.computeBoundingBox()
      const bb = geo.boundingBox
      const cx = (bb.min.x + bb.max.x) / 2
      const cy = (bb.min.y + bb.max.y) / 2
      mesh.position.set(-cx * 8, -bb.min.z * 8, -cy * 8)

      groupRef.current.clear()
      groupRef.current.add(mesh)
      meshRef.current = mesh
      setLoaded(true)
    })
  }, [])

  // Dimension scaling
  useEffect(() => {
    if (!groupRef.current || !loaded) return
    const sx = dimensions.seatWidth / 460
    const sz = dimensions.seatDepth / 420
    const sy = dimensions.hipPointHeight / 440
    groupRef.current.scale.set(sx, sy, sz)
  }, [dimensions, loaded])

  useEffect(() => {
    if (sceneRef) sceneRef.current = groupRef.current
  })

  return <group ref={groupRef} />
}
