import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface SteamFixture {
  appId: number;
  name: string;
  /** The raw appdetails response body. */
  body: Record<string, { success: boolean; data?: { name?: string; pc_requirements?: unknown } }>;
  pcRequirements: unknown;
}

const dir = fileURLToPath(new URL('../fixtures/steam/', import.meta.url));

export const steamFixtures: SteamFixture[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const appId = Number(f.replace('.json', ''));
    const body = JSON.parse(readFileSync(dir + f, 'utf8')) as SteamFixture['body'];
    const data = body[String(appId)]?.data;
    return {
      appId,
      name: data?.name ?? String(appId),
      body,
      pcRequirements: data?.pc_requirements,
    };
  });

export function steamFixture(appId: number): SteamFixture {
  const f = steamFixtures.find((x) => x.appId === appId);
  if (!f) throw new Error(`no steam fixture for ${appId}`);
  return f;
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
