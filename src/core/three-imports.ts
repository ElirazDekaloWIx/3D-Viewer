// Centralized Three.js import
// When WebGPU is available, we need all THREE objects from the webgpu build
// This module resolves the correct build once and exports it

import * as THREE_STANDARD from 'three';

let THREE_RESOLVED: typeof THREE_STANDARD = THREE_STANDARD;
let _isWebGPU = false;

export async function initThree(): Promise<{ THREE: typeof THREE_STANDARD; isWebGPU: boolean }> {
  if (navigator.gpu) {
    try {
      const gpuModule = await import('three/webgpu');
      THREE_RESOLVED = gpuModule as unknown as typeof THREE_STANDARD;
      _isWebGPU = true;
      console.log('[3D Viewer] Using three/webgpu build');
    } catch {
      console.log('[3D Viewer] WebGPU import failed, using standard three');
    }
  }
  return { THREE: THREE_RESOLVED, isWebGPU: _isWebGPU };
}

export function getTHREE(): typeof THREE_STANDARD {
  return THREE_RESOLVED;
}

export function isWebGPUBuild(): boolean {
  return _isWebGPU;
}
