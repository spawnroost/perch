import { z } from 'zod';

export const accountPatchSchema = z
  .object({ hideFreeToPlay: z.boolean().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');
export type AccountPatch = z.infer<typeof accountPatchSchema>;
