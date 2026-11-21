import { z } from 'zod';

/** The cheapest current offer across the active PC stores. */
export const priceOfferSchema = z.object({
  store: z.string(),
  price: z.number().nonnegative(),
  /** The price without the discount. */
  retailPrice: z.number().nonnegative(),
  /** Whole percent off retailPrice; 0 when not on sale. */
  savingsPct: z.number().int().min(0).max(100),
  /** Redirect to the store's page for the deal. */
  url: z.string().url(),
});

export const historicLowSchema = z.object({
  price: z.number().nonnegative(),
  /** ISO date the low was seen, when known. */
  date: z.string().nullable(),
});

/** Prices for one game; every amount is in `currency`. */
export const priceInfoSchema = z.object({
  currency: z.literal('USD'),
  best: priceOfferSchema.nullable(),
  historicLow: historicLowSchema.nullable(),
});

/** `prices` is null when the game is not sold on a tracked PC store (or not matched with confidence). */
export const priceResponseSchema = z.object({
  prices: priceInfoSchema.nullable(),
  /** True when the lookup is still running past the wait; ask again shortly. */
  pending: z.boolean().optional(),
});

export type PriceOffer = z.infer<typeof priceOfferSchema>;
export type HistoricLow = z.infer<typeof historicLowSchema>;
export type PriceInfo = z.infer<typeof priceInfoSchema>;
export type PriceResponse = z.infer<typeof priceResponseSchema>;
