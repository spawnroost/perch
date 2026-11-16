import { z } from 'zod';
import { isoDate } from './common.js';

export const deviceSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  name: z.string(),
  platformIds: z.array(z.number().int()),
  gpuName: z.string().nullable(),
  gpuScore: z.number().nullable(),
  cpuName: z.string().nullable(),
  cpuScore: z.number().nullable(),
  ramGb: z.number().nullable(),
  isDefault: z.boolean(),
  createdAt: isoDate,
});
export const deviceListResponseSchema = z.object({ devices: z.array(deviceSchema) });
export const deviceResponseSchema = z.object({ device: deviceSchema });

const name = z.string().trim().min(1).max(80);
const hwName = z.string().trim().min(1).max(120);
const ramGb = z.number().positive().max(1024);

export const deviceCreateSchema = z.union([
  z.object({ preset: z.string().trim().min(1).max(40), isDefault: z.boolean().optional() }),
  z.object({
    pc: z.object({ gpu: hwName, cpu: hwName, ramGb, name: name.optional() }),
    isDefault: z.boolean().optional(),
  }),
]);

export const devicePatchSchema = z
  .object({
    name: name.optional(),
    isDefault: z.boolean().optional(),
    gpu: hwName.optional(),
    cpu: hwName.optional(),
    ramGb: ramGb.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');

export const devicePresetsResponseSchema = z.object({
  presets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      platformIds: z.array(z.number().int()),
      /** Fixed hardware (handhelds); false for consoles. */
      hasHardware: z.boolean(),
      deckCompat: z.boolean(),
    }),
  ),
});

export const hardwareQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});
export const hardwareResponseSchema = z.object({
  results: z.array(z.object({ key: z.string(), score: z.number() })),
});

export type DevicePresetsResponse = z.infer<typeof devicePresetsResponseSchema>;
export type DeviceView = z.infer<typeof deviceSchema>;
export type DeviceCreate = z.input<typeof deviceCreateSchema>;
export type DevicePatchInput = z.input<typeof devicePatchSchema>;
