/** Browser hardware hints for the PC device form. Hints only: the user confirms them. */

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

/** Clean a WebGL renderer string into something the GPU autocomplete can match. */
export function parseGpuRenderer(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text || SOFTWARE.test(text)) return null;

  let name = text;
  const angle = /^ANGLE \((.*)\)$/s.exec(text);
  if (angle) {
    // "vendor, renderer, backend": the renderer sits between the first and last comma.
    const parts = angle[1]!.split(',').map((p) => p.trim());
    name = parts.length >= 3 ? parts.slice(1, -1).join(', ') : (parts[1] ?? parts[0] ?? '');
  }

  const cleaned = name
    .replace(/^ANGLE Metal Renderer:\s*/i, '')
    .replace(/^Mesa\s+/i, '')
    .replace(/\(R\)|\(TM\)|®|™/g, '')
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
    .replace(/\s+Direct3D\d*.*$/i, '')
    .replace(/\/PCIe.*$|\/SSE2.*$/i, '')
    .replace(/\s*\([A-Z0-9 ]+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

let cachedRenderer: string | null | undefined;

/** Test hook: forget the cached WebGL probe. */
export function resetWebglRendererCache(): void {
  cachedRenderer = undefined;
}

/**
 * GPU renderer string from the WebGL debug extension, or null when unavailable.
 * Probed once per page load; the context is released straight after.
 */
export function readWebglRenderer(): string | null {
  if (cachedRenderer !== undefined) return cachedRenderer;
  cachedRenderer = probeWebglRenderer();
  return cachedRenderer;
}

function probeWebglRenderer(): string | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    if (!gl || !info) return null;
    const renderer: unknown = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === 'string' ? parseGpuRenderer(renderer) : null;
  } catch {
    return null;
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export interface MemoryHint {
  gb: number;
  /** `navigator.deviceMemory` is capped at 8, so 8 means "8 or more". */
  atLeast: boolean;
}

const DEVICE_MEMORY_CAP = 8;

export function parseDeviceMemory(value: unknown): MemoryHint | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return { gb: value, atLeast: value >= DEVICE_MEMORY_CAP };
}

export function readDeviceMemory(): MemoryHint | null {
  return parseDeviceMemory((navigator as Navigator & { deviceMemory?: number }).deviceMemory);
}
