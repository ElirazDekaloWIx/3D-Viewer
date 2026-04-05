import * as THREE from 'three';
import { getTHREE, isWebGPUBuild } from './three-imports';

export interface RendererContext {
  renderer: THREE.WebGLRenderer;
  isWebGPU: boolean;
  canvas: HTMLCanvasElement;
  compileAsync: (object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene) => Promise<void>;
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<RendererContext> {
  const T = getTHREE();
  const useGPU = isWebGPUBuild();

  if (useGPU) {
    const gpuRenderer = new (T as any).WebGPURenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    gpuRenderer.toneMapping = T.ACESFilmicToneMapping;
    gpuRenderer.toneMappingExposure = 1.0;
    gpuRenderer.outputColorSpace = T.SRGBColorSpace;
    gpuRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    gpuRenderer.setSize(canvas.clientWidth, canvas.clientHeight);

    await gpuRenderer.init();
    console.log('[3D Viewer] WebGPU renderer active');

    return {
      renderer: gpuRenderer as unknown as THREE.WebGLRenderer,
      isWebGPU: true,
      canvas,
      compileAsync: (object, camera, scene) =>
        gpuRenderer.compileAsync(object, camera, scene),
    };
  }

  // WebGL2
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });

  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  console.log('[3D Viewer] WebGL2 renderer active');
  return {
    renderer,
    isWebGPU: false,
    canvas,
    compileAsync: async () => {},
  };
}

export function handleResize(ctx: RendererContext, camera: THREE.PerspectiveCamera): void {
  const { renderer, canvas } = ctx;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}
