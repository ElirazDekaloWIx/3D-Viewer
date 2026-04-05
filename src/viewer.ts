import * as THREE from 'three';
import { initThree, getTHREE } from './core/three-imports';
import { createRenderer, handleResize, type RendererContext } from './core/renderer';
import { createScene, fitCameraToModel, type SceneContext } from './core/scene-manager';
import { AssetLoader, type LoadResult } from './loading/asset-loader';
import { EventBus, type ViewerEvents } from './core/event-bus';

// ====== Types ======

export interface ViewerOptions {
  background?: string | number;
  environment?: 'studio' | 'outdoor' | 'sunset' | 'none';
  exposure?: number;
  autoSmooth?: boolean;
  shadows?: boolean;
  bloom?: boolean | { intensity?: number; threshold?: number; radius?: number };
  toneMapping?: 'aces' | 'agx' | 'linear' | 'neutral' | 'reinhard' | 'cineon';
}

export interface ModelInfo {
  meshes: number;
  triangles: number;
  animations: string[];
  materials: { name: string; type: string; features: string[] }[];
}

// ====== Main Class ======

export class Viewer3D {
  private rendererCtx!: RendererContext;
  private sceneCtx!: SceneContext;
  private loader!: AssetLoader;
  private events = new EventBus();
  private currentModel: THREE.Group | null = null;
  private modelAnimations: THREE.AnimationClip[] = [];
  private ground!: THREE.Mesh;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.HemisphereLight;
  private initialized = false;
  private options: ViewerOptions;

  constructor(private canvas: HTMLCanvasElement, options: ViewerOptions = {}) {
    this.options = {
      background: '#555560',
      environment: 'studio',
      exposure: 1.0,
      autoSmooth: true,
      shadows: true,
      bloom: false,
      toneMapping: 'aces',
      ...options,
    };
  }

  // ====== Lifecycle ======

  async init(): Promise<void> {
    await initThree();
    const T = getTHREE();

    this.rendererCtx = await createRenderer(this.canvas);
    this.sceneCtx = createScene(this.canvas);
    this.loader = new AssetLoader(this.rendererCtx.renderer);

    // Apply tone mapping
    const tmMap: Record<string, number> = {
      aces: THREE.ACESFilmicToneMapping,
      agx: 6, linear: THREE.LinearToneMapping,
      neutral: 5, reinhard: THREE.ReinhardToneMapping, cineon: THREE.CineonToneMapping,
    };
    this.rendererCtx.renderer.toneMapping = tmMap[this.options.toneMapping || 'aces'] ?? THREE.ACESFilmicToneMapping;
    this.rendererCtx.renderer.toneMappingExposure = this.options.exposure ?? 1.0;

    this.setupLighting();
    this.setupGround();

    if (this.options.background) {
      this.setBackground(this.options.background);
    }

    // Shadows
    if (this.rendererCtx.isWebGPU) {
      this.rendererCtx.renderer.shadowMap.enabled = this.options.shadows !== false;
      this.rendererCtx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    window.addEventListener('resize', this.onResize);
    this.initialized = true;
    this.rendererCtx.renderer.setAnimationLoop(this.animate);

    this.events.emit('renderer:ready', { isWebGPU: this.rendererCtx.isWebGPU });
  }

  async loadModel(url: string, onProgress?: (percent: number) => void): Promise<ModelInfo> {
    if (!this.initialized) await this.init();

    if (this.currentModel) {
      this.sceneCtx.scene.remove(this.currentModel);
      this.currentModel = null;
    }

    const result: LoadResult = await this.loader.load(url, onProgress);
    this.currentModel = result.scene;
    this.modelAnimations = result.animations;

    // Auto-smooth
    if (this.options.autoSmooth) {
      const { mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js');
      this.currentModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const geo = mesh.geometry;
          const pos = geo?.getAttribute('position');
          if (pos) {
            const tris = geo.index ? geo.index.count / 3 : pos.count / 3;
            if (tris < 50000) {
              mesh.geometry = mergeVertices(geo, 0.0001);
              mesh.geometry.computeVertexNormals();
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach(m => { (m as any).flatShading = false; m.needsUpdate = true; });
            }
          }
        }
      });
    }

    // Compile for WebGPU
    await this.rendererCtx.compileAsync(this.currentModel, this.sceneCtx.camera, this.sceneCtx.scene);

    this.sceneCtx.scene.add(this.currentModel);
    fitCameraToModel(this.sceneCtx.camera, this.sceneCtx.controls, this.currentModel);

    // Fit ground & shadow camera
    const box = new THREE.Box3().setFromObject(this.currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    this.ground.position.y = box.min.y - 0.01;

    const pad = maxDim * 0.8;
    this.keyLight.shadow.camera.left = -pad;
    this.keyLight.shadow.camera.right = pad;
    this.keyLight.shadow.camera.top = pad;
    this.keyLight.shadow.camera.bottom = -pad;
    this.keyLight.shadow.camera.far = maxDim * 5;
    this.keyLight.shadow.camera.updateProjectionMatrix();
    this.keyLight.position.set(center.x + maxDim, center.y + maxDim * 1.5, center.z + maxDim);
    this.keyLight.target.position.copy(center);
    this.keyLight.target.updateMatrixWorld();

    // Build model info
    const info = this.getModelInfo();

    this.events.emit('model:loaded', { scene: result.scene, animations: result.animations });
    return info;
  }

  // ====== Environment ======

  async setEnvironment(name: 'studio' | 'outdoor' | 'sunset' | 'none'): Promise<void> {
    if (name === 'none') {
      this.sceneCtx.scene.environment = null;
      return;
    }
    const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
    const T = getTHREE();
    const envPaths: Record<string, string> = {
      studio: '/env/studio.hdr', outdoor: '/env/outdoor.hdr', sunset: '/env/sunset.hdr',
    };
    const pmrem = new T.PMREMGenerator(this.rendererCtx.renderer);
    pmrem.compileEquirectangularShader();
    const hdr = await new RGBELoader().loadAsync(envPaths[name]);
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    this.sceneCtx.scene.environment = envMap;
    hdr.dispose();
    pmrem.dispose();
  }

  setEnvironmentIntensity(value: number): void {
    (this.sceneCtx.scene as any).environmentIntensity = value;
  }

  setEnvironmentRotation(degrees: number): void {
    (this.sceneCtx.scene as any).environmentRotation?.set(0, degrees * Math.PI / 180, 0);
  }

  // ====== Appearance ======

  setExposure(value: number): void {
    this.rendererCtx.renderer.toneMappingExposure = value;
  }

  setBackground(color: string | number): void {
    const T = getTHREE();
    this.sceneCtx.scene.background = new T.Color(color);
  }

  setBackgroundGradient(center: string, mid: string, edge: string): void {
    const s = 1024;
    const c = document.createElement('canvas'); c.width = s; c.height = s;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(s/2, s*0.45, 0, s/2, s*0.45, s*0.75);
    g.addColorStop(0, center); g.addColorStop(0.5, mid); g.addColorStop(1, edge);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const T = getTHREE();
    this.sceneCtx.scene.background = new T.CanvasTexture(c);
  }

  // ====== Lighting ======

  setKeyLight(options: { intensity?: number; color?: string; position?: [number, number, number] }): void {
    if (options.intensity !== undefined) this.keyLight.intensity = options.intensity;
    if (options.color) this.keyLight.color.set(options.color);
    if (options.position) this.keyLight.position.set(...options.position);
  }

  setFillLight(options: { intensity?: number; color?: string; position?: [number, number, number] }): void {
    if (options.intensity !== undefined) this.fillLight.intensity = options.intensity;
    if (options.color) this.fillLight.color.set(options.color);
    if (options.position) this.fillLight.position.set(...options.position);
  }

  setRimLight(options: { intensity?: number; color?: string; position?: [number, number, number] }): void {
    if (options.intensity !== undefined) this.rimLight.intensity = options.intensity;
    if (options.color) this.rimLight.color.set(options.color);
    if (options.position) this.rimLight.position.set(...options.position);
  }

  setAmbient(intensity: number): void {
    this.ambientLight.intensity = intensity;
  }

  // ====== Shadows ======

  setShadows(options: { enabled?: boolean; radius?: number; bias?: number }): void {
    if (options.enabled !== undefined) this.keyLight.castShadow = options.enabled;
    if (options.radius !== undefined) this.keyLight.shadow.radius = options.radius;
    if (options.bias !== undefined) this.keyLight.shadow.bias = options.bias;
  }

  // ====== Camera ======

  setFOV(degrees: number): void {
    this.sceneCtx.camera.fov = degrees;
    this.sceneCtx.camera.updateProjectionMatrix();
  }

  setAutoRotate(enabled: boolean, speed = 1): void {
    this.sceneCtx.controls.autoRotate = enabled;
    this.sceneCtx.controls.autoRotateSpeed = speed;
  }

  resetCamera(): void {
    if (this.currentModel) fitCameraToModel(this.sceneCtx.camera, this.sceneCtx.controls, this.currentModel);
  }

  // ====== Model ======

  setModelScale(scale: number): void {
    if (this.currentModel) this.currentModel.scale.setScalar(scale);
  }

  setModelRotationY(degrees: number): void {
    if (this.currentModel) this.currentModel.rotation.y = degrees * Math.PI / 180;
  }

  setWireframe(enabled: boolean): void {
    if (!this.currentModel) return;
    this.currentModel.traverse(c => {
      if ((c as THREE.Mesh).material) (c as THREE.Mesh).material.wireframe = enabled;
    });
  }

  getModelInfo(): ModelInfo {
    if (!this.currentModel) return { meshes: 0, triangles: 0, animations: [], materials: [] };
    let totalTris = 0;
    const materials: ModelInfo['materials'] = [];
    this.currentModel.traverse(c => {
      if (!(c as THREE.Mesh).isMesh) return;
      const mesh = c as THREE.Mesh;
      const g = mesh.geometry;
      const t = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      totalTris += t;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(m => {
        const features: string[] = [];
        if ((m as any).clearcoat > 0) features.push('clearcoat');
        if ((m as any).transmission > 0) features.push('transmission');
        if ((m as any).sheen > 0) features.push('sheen');
        if ((m as any).iridescence > 0) features.push('iridescence');
        if ((m as any).map) features.push('textured');
        materials.push({ name: mesh.name || 'unnamed', type: m.type, features });
      });
    });
    return {
      meshes: materials.length,
      triangles: Math.round(totalTris),
      animations: this.modelAnimations.map(a => a.name),
      materials,
    };
  }

  // ====== Ground ======

  setGround(options: { visible?: boolean; opacity?: number; color?: string; roughness?: number; metalness?: number }): void {
    if (options.visible !== undefined) this.ground.visible = options.visible;
    const mat = this.ground.material as THREE.MeshStandardMaterial;
    if (options.opacity !== undefined) { mat.opacity = options.opacity; mat.transparent = true; }
    if (options.color) mat.color.set(options.color);
    if (options.roughness !== undefined) mat.roughness = options.roughness;
    if (options.metalness !== undefined) mat.metalness = options.metalness;
  }

  // ====== Events ======

  on<K extends keyof ViewerEvents>(event: K, callback: (data: ViewerEvents[K]) => void): void {
    this.events.on(event, callback);
  }

  off<K extends keyof ViewerEvents>(event: K, callback: (data: ViewerEvents[K]) => void): void {
    this.events.off(event, callback);
  }

  // ====== Info ======

  get isWebGPU(): boolean {
    return this.rendererCtx?.isWebGPU ?? false;
  }

  get renderer(): THREE.WebGLRenderer {
    return this.rendererCtx?.renderer;
  }

  get scene(): THREE.Scene {
    return this.sceneCtx?.scene;
  }

  get camera(): THREE.PerspectiveCamera {
    return this.sceneCtx?.camera;
  }

  // ====== Cleanup ======

  dispose(): void {
    this.rendererCtx.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.sceneCtx.controls.dispose();
    this.rendererCtx.renderer.dispose();
    this.loader.dispose();
    this.events.dispose();
  }

  // ====== Private ======

  private setupLighting(): void {
    const T = getTHREE();

    this.ambientLight = new T.HemisphereLight(0xffffff, 0x444444, 0.4);
    this.sceneCtx.scene.add(this.ambientLight);

    this.keyLight = new T.DirectionalLight(0xffffff, 0.8);
    this.keyLight.position.set(5, 8, 5);
    this.keyLight.castShadow = this.options.shadows !== false;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.1;
    this.keyLight.shadow.camera.far = 100;
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.03;
    this.keyLight.shadow.radius = 8;
    this.sceneCtx.scene.add(this.keyLight);
    this.sceneCtx.scene.add(this.keyLight.target);

    this.fillLight = new T.DirectionalLight(0xb4c6e0, 0.3);
    this.fillLight.position.set(-4, 3, 2);
    this.sceneCtx.scene.add(this.fillLight);

    this.rimLight = new T.DirectionalLight(0xffeedd, 0);
    this.rimLight.position.set(-2, 6, -6);
    this.sceneCtx.scene.add(this.rimLight);
  }

  private setupGround(): void {
    const T = getTHREE();
    this.ground = new T.Mesh(
      new T.PlaneGeometry(50, 50),
      new T.MeshStandardMaterial({ color: 0x999999, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.5 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.01;
    this.ground.receiveShadow = true;
    this.sceneCtx.scene.add(this.ground);
  }

  private animate = (): void => {
    this.sceneCtx.controls.update();
    handleResize(this.rendererCtx, this.sceneCtx.camera);
    this.rendererCtx.renderer.render(this.sceneCtx.scene, this.sceneCtx.camera);
  };

  private onResize = (): void => {
    handleResize(this.rendererCtx, this.sceneCtx.camera);
  };
}
