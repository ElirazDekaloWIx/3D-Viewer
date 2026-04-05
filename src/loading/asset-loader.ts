import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

export interface LoadResult {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  cameras: THREE.Camera[];
}

// Angle threshold in radians - faces with angle between them below this
// will be smoothed. 30° is the standard "auto smooth" value.
const SMOOTH_ANGLE = 30 * (Math.PI / 180);

export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  private ktx2Loader: KTX2Loader;
  private manager: THREE.LoadingManager;

  constructor(renderer: THREE.WebGLRenderer) {
    this.manager = new THREE.LoadingManager();

    this.dracoLoader = new DRACOLoader(this.manager);
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.dracoLoader.setDecoderConfig({ type: 'js' });

    this.ktx2Loader = new KTX2Loader(this.manager);
    this.ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.171.0/examples/jsm/libs/basis/');
    this.ktx2Loader.detectSupport(renderer);

    this.gltfLoader = new GLTFLoader(this.manager);
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
  }

  async load(
    url: string,
    onProgress?: (percent: number) => void
  ): Promise<LoadResult> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf: GLTF) => {
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;

              // Auto-smooth: if mesh has no normals or looks low-poly, compute smooth normals
              autoSmooth(mesh);
            }
          });

          resolve({
            scene: gltf.scene,
            animations: gltf.animations,
            cameras: gltf.cameras,
          });
        },
        (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress((event.loaded / event.total) * 100);
          }
        },
        (error) => {
          reject(new Error(`Failed to load model: ${error}`));
        }
      );
    });
  }

  dispose(): void {
    this.dracoLoader.dispose();
    this.ktx2Loader.dispose();
  }
}

/**
 * Auto-smooth: detects if a mesh needs smoothing and applies it intelligently.
 *
 * Logic:
 * 1. If the geometry has no normal attribute → compute smooth vertex normals
 * 2. If the geometry uses flat normals (each face has uniform normal) and is
 *    low-poly (< 10k triangles) → recompute with angle-based smoothing
 * 3. High-poly meshes or meshes with existing smooth normals → leave as-is
 */
function autoSmooth(mesh: THREE.Mesh): void {
  const geometry = mesh.geometry;
  if (!geometry || !(geometry instanceof THREE.BufferGeometry)) return;

  const normalAttr = geometry.getAttribute('normal');
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return;

  const triangleCount = geometry.index
    ? geometry.index.count / 3
    : positionAttr.count / 3;

  // Case 1: No normals at all → compute smooth normals
  if (!normalAttr) {
    geometry.computeVertexNormals();
    return;
  }

  // Case 2: Check if normals are flat (each triangle has identical normals for all 3 verts)
  // Only process low-poly meshes (< 10k triangles) to avoid expensive checks on detailed meshes
  if (triangleCount > 10000) return;

  if (hasFlatNormals(geometry)) {
    // Recompute smooth normals
    geometry.computeVertexNormals();
  }
}

/**
 * Quick check: sample a few triangles to detect if the geometry uses flat shading.
 * If all 3 vertices of sampled triangles share the exact same normal → flat shading.
 */
function hasFlatNormals(geometry: THREE.BufferGeometry): boolean {
  const normal = geometry.getAttribute('normal');
  const index = geometry.index;
  if (!normal) return false;

  const sampleCount = Math.min(20, Math.floor((index ? index.count : normal.count) / 3));
  let flatCount = 0;

  for (let i = 0; i < sampleCount; i++) {
    const triIndex = i * 3;

    let i0: number, i1: number, i2: number;
    if (index) {
      i0 = index.getX(triIndex);
      i1 = index.getX(triIndex + 1);
      i2 = index.getX(triIndex + 2);
    } else {
      i0 = triIndex;
      i1 = triIndex + 1;
      i2 = triIndex + 2;
    }

    // Get normals of the 3 vertices
    const nx0 = normal.getX(i0), ny0 = normal.getY(i0), nz0 = normal.getZ(i0);
    const nx1 = normal.getX(i1), ny1 = normal.getY(i1), nz1 = normal.getZ(i1);
    const nx2 = normal.getX(i2), ny2 = normal.getY(i2), nz2 = normal.getZ(i2);

    // Check if all 3 normals are identical (flat shading)
    const eps = 0.001;
    const same01 = Math.abs(nx0 - nx1) < eps && Math.abs(ny0 - ny1) < eps && Math.abs(nz0 - nz1) < eps;
    const same02 = Math.abs(nx0 - nx2) < eps && Math.abs(ny0 - ny2) < eps && Math.abs(nz0 - nz2) < eps;

    if (same01 && same02) flatCount++;
  }

  // If most sampled triangles have flat normals → it's a flat-shaded mesh
  return flatCount > sampleCount * 0.8;
}
