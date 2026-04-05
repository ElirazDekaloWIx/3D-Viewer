import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getTHREE } from './three-imports';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const T = getTHREE();

  const scene = new T.Scene();
  scene.background = new T.Color(0xf0f0f0);

  const camera = new T.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    0.01,
    1000
  );
  camera.position.set(3, 2, 5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.1;
  controls.maxDistance = 100;
  controls.target.set(0, 0, 0);
  controls.update();

  return { scene, camera, controls };
}

export function fitCameraToModel(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D
): void {
  const T = getTHREE();
  const box = new T.Box3().setFromObject(object);
  const center = box.getCenter(new T.Vector3());
  const size = box.getSize(new T.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim === 0) return;

  const fov = camera.fov * (Math.PI / 180);
  const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5;

  camera.position.set(
    center.x + distance * 0.4,
    center.y + distance * 0.3,
    center.z + distance * 0.8
  );

  camera.near = distance * 0.001;
  camera.far = distance * 10;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}
