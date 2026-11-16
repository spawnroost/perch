import { describe, expect, it } from 'vitest';
import { parseDeviceMemory, parseGpuRenderer } from '../src/lib/gpuHint.js';

describe('parseGpuRenderer', () => {
  it.each([
    [
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'NVIDIA GeForce GTX 1660 Ti',
    ],
    [
      'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.5.0)',
      'NVIDIA GeForce RTX 3060',
    ],
    [
      'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Intel UHD Graphics 620',
    ],
    [
      'ANGLE (AMD, AMD Radeon RX 6700 XT (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'AMD Radeon RX 6700 XT',
    ],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 'Apple M1'],
    ['Mesa Intel(R) UHD Graphics 620 (CFL GT2)', 'Intel UHD Graphics 620'],
    ['NVIDIA GeForce GTX 1050 Ti/PCIe/SSE2', 'NVIDIA GeForce GTX 1050 Ti'],
  ])('cleans %s', (raw, expected) => {
    expect(parseGpuRenderer(raw)).toBe(expected);
  });

  it('returns null for software renderers and empty input', () => {
    expect(
      parseGpuRenderer(
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      ),
    ).toBeNull();
    expect(parseGpuRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBeNull();
    expect(parseGpuRenderer('')).toBeNull();
    expect(parseGpuRenderer(null)).toBeNull();
    expect(parseGpuRenderer(undefined)).toBeNull();
  });
});

describe('parseDeviceMemory', () => {
  it('reports the value and flags the browser cap at 8', () => {
    expect(parseDeviceMemory(4)).toEqual({ gb: 4, atLeast: false });
    expect(parseDeviceMemory(8)).toEqual({ gb: 8, atLeast: true });
  });
  it('ignores missing or invalid values', () => {
    expect(parseDeviceMemory(undefined)).toBeNull();
    expect(parseDeviceMemory(0)).toBeNull();
    expect(parseDeviceMemory('8')).toBeNull();
    expect(parseDeviceMemory(Number.NaN)).toBeNull();
  });
});
