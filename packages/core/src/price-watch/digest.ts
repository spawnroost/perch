import { and, eq } from 'drizzle-orm';
import { priceWatches, users, type Db } from '@perch/db';
import { pricesFresh, type PricesOptions } from '../prices/index.js';
import { isSteamPlaceholderEmail } from '../steam-auth/index.js';
import { claimAutoSync, releaseAutoSync } from '../steam-library/claim.js';
import { listWatches } from './db.js';
import { buildDigest, evaluateWatch, type DigestItem } from './evaluate.js';

/** At most one digest per user per day; a little under 24 h so an hourly tick never skips a day. */
export const DIGEST_MIN_GAP_MS = 23 * 60 * 60 * 1000;

export interface DigestDeps {
  db: Db;
  /** Sends one plain-text mail; may throw. */
  send: (mail: { to: string; subject: string; text: string }) => Promise<void>;
  /** Public web address, for the links in the mail. */
  webOrigin: string;
  now?: () => Date;
  prices?: PricesOptions;
}

export interface DigestResult {
  /** Users whose watches were checked. */
  checked: number;
  /** Digests sent. */
  sent: number;
}

/** Users with a watch who want the email and have an address that can receive it (verified, not a Steam placeholder). */
async function mailableWatchers(db: Db): Promise<{ id: string; email: string }[]> {
  const rows = await db
    .selectDistinct({ id: users.id, email: users.email })
    .from(priceWatches)
    .innerJoin(users, eq(users.id, priceWatches.userId))
    .where(and(eq(users.emailVerified, true), eq(users.priceEmails, true)));
  return rows.filter((u) => !isSteamPlaceholderEmail(u.email));
}

/**
 * One daily pass: for each user who watches games, claim the day's digest slot (a conditional
 * UPDATE on users.price_digest_at, so concurrent instances have one winner), check the watched
 * games' prices and send one mail with every new deal. A deal is announced once (see
 * `evaluateWatch`). With nothing to announce, or when the mail fails, the slot is given back so
 * the next pass checks again. Safe to call often: prices are cached for 12 hours.
 */
export async function runPriceDigest(deps: DigestDeps): Promise<DigestResult> {
  const { db, send, webOrigin, now = () => new Date() } = deps;
  const result: DigestResult = { checked: 0, sent: 0 };
  for (const user of await mailableWatchers(db)) {
    const claim = await claimAutoSync(db, user.id, now(), 'priceDigestAt', DIGEST_MIN_GAP_MS);
    if (!claim.claimed) continue;
    result.checked++;
    let mailed = false;
    try {
      const items: DigestItem[] = [];
      for (const w of await listWatches(db, user.id)) {
        const { prices, stale } = await pricesFresh(
          db,
          { igdbId: w.igdbId, name: w.name, steamAppId: w.steamAppId },
          deps.prices,
        );
        // Prices that could not be refreshed prove nothing: neither announce nor clear on them.
        if (stale) continue;
        const decision = evaluateWatch(w, prices);
        const key = and(eq(priceWatches.userId, user.id), eq(priceWatches.igdbId, w.igdbId));
        if (decision.action === 'clear') {
          await db.update(priceWatches).set({ lastNotifiedPrice: null }).where(key);
        } else if (decision.action === 'notify') {
          items.push({
            igdbId: w.igdbId,
            name: w.name,
            targetPrice: w.targetPrice,
            deal: decision.deal,
          });
        }
      }
      if (items.length > 0) {
        await send({ to: user.email, ...buildDigest(items, webOrigin) });
        mailed = true;
        result.sent++;
        // One transaction for all mailed games: either every deal is remembered or none is.
        const at = now();
        try {
          await db.transaction(async (tx) => {
            for (const i of items) {
              await tx
                .update(priceWatches)
                .set({ lastNotifiedPrice: i.deal.price, lastNotifiedAt: at })
                .where(and(eq(priceWatches.userId, user.id), eq(priceWatches.igdbId, i.igdbId)));
            }
          });
        } catch (err) {
          console.error(
            `price digest for user ${user.id} was SENT but could not be recorded; its deals may be announced again:`,
            err,
          );
        }
      }
    } catch (err) {
      console.error(`price digest for user ${user.id} failed:`, err);
    }
    // Keep the slot only when a mail went out; otherwise the next pass looks again.
    if (!mailed) await releaseAutoSync(db, user.id, claim, 'priceDigestAt').catch(() => undefined);
  }
  return result;
}
