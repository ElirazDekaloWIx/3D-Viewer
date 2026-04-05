export interface ViewerEvents {
  'model:loaded': { scene: THREE.Group; animations: THREE.AnimationClip[] };
  'model:progress': { stage: number; percent: number };
  'model:error': { error: Error };
  'quality:changed': { tier: string; reason: string };
  'env:loaded': { envMap: THREE.Texture };
  'renderer:ready': { isWebGPU: boolean };
}

type EventCallback<T = unknown> = (data: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<EventCallback>>();

  on<K extends keyof ViewerEvents>(event: K, callback: EventCallback<ViewerEvents[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);
  }

  off<K extends keyof ViewerEvents>(event: K, callback: EventCallback<ViewerEvents[K]>): void {
    this.listeners.get(event)?.delete(callback as EventCallback);
  }

  emit<K extends keyof ViewerEvents>(event: K, data: ViewerEvents[K]): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  dispose(): void {
    this.listeners.clear();
  }
}
