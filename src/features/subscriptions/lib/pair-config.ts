/**
 * Codec for purchase-time pair configurations riding Shopify checkout as
 * line-item attributes (_pair_1.._pair_N). Client-safe: no server imports.
 * Values MUST stay ≤255 chars (Shopify attribute limit) — proven by test.
 */

export interface PairConfig {
  v: number;
  h: string;
  l: 'non_rx' | 'single_vision' | 'progressive';
  u: string[];
  t: 'none' | 'grey' | 'amber' | 'green';
  b?: boolean;
}

export const PAIR_ATTR_MAX = 255;

const LENS_TYPES = new Set(['non_rx', 'single_vision', 'progressive']);
const PAID_UPGRADES = new Set(['progressive', 'photochromic', 'ar']);
const TINTS = new Set(['none', 'grey', 'amber', 'green']);
const MAX_HANDLE = 100;

export function encodePairAttributes(configs: PairConfig[]): Array<{ key: string; value: string }> {
  return configs.map((c, i) => ({
    key: `_pair_${i + 1}`,
    value: JSON.stringify(c.b ? { v: c.v, h: c.h, l: c.l, u: c.u, t: c.t, b: true } : { v: c.v, h: c.h, l: c.l, u: c.u, t: c.t }),
  }));
}

function coerceConfig(raw: unknown): PairConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const v = Number(o.v);
  const h = typeof o.h === 'string' ? o.h : '';
  const l = String(o.l ?? '');
  const u = Array.isArray(o.u) ? o.u.map(String) : null;
  const t = String(o.t ?? 'none');
  const b = o.b === true;
  if (!Number.isInteger(v) || v <= 0) return null;
  if (!h || h.length > MAX_HANDLE) return null;
  if (!LENS_TYPES.has(l)) return null;
  if (!u || u.some((x) => !PAID_UPGRADES.has(x)) || new Set(u).size !== u.length) return null;
  if (!TINTS.has(t)) return null;
  // progressive lens ⟺ progressive upgrade (it is how the charge is carried)
  const hasProg = u.includes('progressive');
  if ((l === 'progressive') !== hasProg) return null;
  const config: PairConfig = { v, h, l: l as PairConfig['l'], u, t: t as PairConfig['t'] };
  if (b) config.b = true;
  return config;
}

/** Accepts raw ('_pair_1') and webhook-normalized ('pair1') property names. */
export function parsePairProperty(name: string, value: string): { index: number; config: PairConfig } | null {
  const m = /^_?pair_?(\d+)$/.exec(name.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
  if (!m) return null;
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { return null; }
  const config = coerceConfig(raw);
  if (!config) return null;
  return { index: Number(m[1]), config };
}

export function validatePairConfigs(
  input: unknown,
  maxPairs: number,
): { ok: true; configs: PairConfig[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'pair configs must be an array' };
  if (input.length > maxPairs) return { ok: false, error: `plan covers ${maxPairs} pairs, got ${input.length}` };
  const configs: PairConfig[] = [];
  for (const raw of input) {
    const c = coerceConfig(raw);
    if (!c) return { ok: false, error: 'invalid pair configuration' };
    configs.push(c);
  }
  return { ok: true, configs };
}

/** Option ids charged as LENSUP-* lines for this pair. Covered choices never appear. */
export function chargeableOptionIds(c: PairConfig): string[] {
  return [...c.u, ...(c.t !== 'none' ? [c.t] : [])];
}

/**
 * Lens spec in createRedemptionFulfillmentOrder vocabulary. non_rx maps to
 * 'plano' — redemption-order treats any other value as wanting Rx.
 */
export function pairRedemptionLensConfig(c: PairConfig): { lens_type: string; coatings: string[]; tint: string } {
  return {
    lens_type: c.l === 'non_rx' ? 'plano' : c.l,
    coatings: [...(c.b ? ['blue_light'] : []), ...c.u.filter((x) => x === 'photochromic' || x === 'ar')],
    tint: c.t,
  };
}
