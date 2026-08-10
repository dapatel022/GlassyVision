'use client';

import { createContext, useContext, useEffect, useReducer, useState, useCallback } from 'react';
import {
  builderReducer,
  INITIAL_BUILDER_STATE,
  reconcileHydratedState,
  canPersistAfterHydration,
  type BuilderState,
  type Tier,
  type TierPairsMap,
} from './builder-state';
import { parsePairProperty, type PairConfig } from '@/features/subscriptions/lib/pair-config';

const STORAGE_KEY = 'gv_builder_v1';

interface BuilderContextValue {
  state: BuilderState;
  hydrated: boolean;
  setTier: (tier: Tier, pairs: number) => void;
  setPair: (index: number, config: PairConfig) => void;
  clearPair: (index: number) => void;
  reset: () => void;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

/**
 * Parses+validates a stored `gv_builder_v1` payload. Every non-null pair
 * entry is round-tripped through parsePairProperty — the same coercion
 * pair-config.ts applies to Shopify line-item attributes — so a tampered or
 * stale entry (missing fields, bad enum values, etc.) can't reach the
 * reducer as a trusted PairConfig. Any single bad field invalidates the
 * whole stored state rather than partially restoring it.
 */
function parseStoredBuilderState(raw: string): BuilderState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  const tier = o.tier;
  if (tier !== null && tier !== 'solo' && tier !== 'duo' && tier !== 'trio') return null;
  if (!Array.isArray(o.pairs)) return null;

  const pairs: Array<PairConfig | null> = [];
  for (let i = 0; i < o.pairs.length; i++) {
    const entry = o.pairs[i];
    if (entry === null) {
      pairs.push(null);
      continue;
    }
    let encoded: string;
    try {
      encoded = JSON.stringify(entry);
    } catch {
      return null;
    }
    const parsedPair = parsePairProperty(`_pair_${i + 1}`, encoded);
    if (!parsedPair) return null;
    pairs.push(parsedPair.config);
  }
  return { tier, pairs };
}

/**
 * `tierPairs` is the live tier→pair-count entitlement (derived from
 * `data.tiers` by the caller, e.g. PlanBuilder). It's the authority
 * hydration reconciles stored state against — see reconcileHydratedState.
 * Omitting it (tiers unavailable) means no stored tier is trusted, which
 * is the correct fail-closed behavior when live pricing itself is down.
 */
export function BuilderProvider({ children, tierPairs }: { children: React.ReactNode; tierPairs?: TierPairsMap }) {
  const [state, dispatch] = useReducer(builderReducer, INITIAL_BUILDER_STATE);
  const [hydrated, setHydrated] = useState(false);
  // Gates the persistence effect below. False when this mount hydrated
  // without live tier data (tierPairs undefined — a transient pricing
  // outage): the in-session state is fail-closed to INITIAL_BUILDER_STATE
  // for THIS load, but that must never be written back over a real stored
  // plan. See canPersistAfterHydration.
  const [canPersist, setCanPersist] = useState(false);

  // One-time hydration from localStorage on mount. Guarded for SSR (no
  // `window`/`localStorage` on the server) and never throws on malformed
  // stored JSON — a corrupt entry just falls back to the initial state.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = parseStoredBuilderState(raw);
        // reconcileHydratedState is the single source of truth for what's
        // trustworthy: an unknown/stale tier, or a stored pairs array whose
        // length doesn't match the tier's REAL entitlement, both fail
        // closed / get clamped there — never trust stored.pairs.length
        // directly. setTier first so pairs is sized correctly, THEN replay
        // configured pairs (each dispatch chains off the reducer's pending
        // state, so ordering here is safe within a single effect).
        const reconciled = reconcileHydratedState(stored, tierPairs);
        if (reconciled.tier) {
          dispatch({ type: 'setTier', tier: reconciled.tier, pairs: reconciled.pairs.length });
          reconciled.pairs.forEach((config, i) => {
            if (config) dispatch({ type: 'setPair', index: i, config });
          });
        }
      }
    } catch {
      // malformed stored JSON — start fresh
    }
    setCanPersist(canPersistAfterHydration(tierPairs));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // canPersist === false means this load hydrated without live tier data
    // (pricing fetch failed) — skip the write entirely so a real stored
    // plan survives untouched. The next page load, once pricing returns,
    // will reconcile normally against the untouched localStorage entry.
    if (!hydrated || !canPersist) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full / disabled — ignore
    }
  }, [state, hydrated, canPersist]);

  const setTier = useCallback((tier: Tier, pairs: number) => {
    dispatch({ type: 'setTier', tier, pairs });
  }, []);

  const setPair = useCallback((index: number, config: PairConfig) => {
    dispatch({ type: 'setPair', index, config });
  }, []);

  const clearPair = useCallback((index: number) => {
    dispatch({ type: 'clearPair', index });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  return (
    <BuilderContext.Provider value={{ state, hydrated, setTier, setPair, clearPair, reset }}>
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilder must be used inside BuilderProvider');
  return ctx;
}
