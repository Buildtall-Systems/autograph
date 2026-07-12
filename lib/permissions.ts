import type { Capability } from './protocol';

export const CAPABILITY_LEVEL: Record<Capability, number> = {
  getPublicKey: 1,
  getRelays: 5,
  signEvent: 10,
  'nip04.encrypt': 20,
  'nip04.decrypt': 20,
  'nip44.encrypt': 20,
  'nip44.decrypt': 20,
};

export const GRANT_CONDITIONS = [
  'forever',
  'expirable_5m',
  'expirable_1h',
  'expirable_8h',
  'expirable_custom',
  'single',
  'no',
] as const;

export type GrantCondition = (typeof GRANT_CONDITIONS)[number];

const FIXED_CONDITION_SECONDS: Partial<Record<GrantCondition, number>> = {
  expirable_5m: 5 * 60,
  expirable_1h: 60 * 60,
  expirable_8h: 8 * 60 * 60,
};

export const MIN_CUSTOM_DURATION_SECONDS = 60;
export const MAX_CUSTOM_DURATION_SECONDS = 366 * 24 * 60 * 60;

export interface Grant {
  condition: GrantCondition;
  level: number;
  createdAt: number;
  durationSeconds?: number;
}

export type PermissionMap = Record<string, Grant>;

export type Decision = 'allow' | 'deny' | 'ask';

export class InvalidDurationError extends Error {
  constructor(seconds: number) {
    super(
      `custom grant duration ${String(seconds)}s is outside ` +
        `[${String(MIN_CUSTOM_DURATION_SECONDS)}, ${String(MAX_CUSTOM_DURATION_SECONDS)}]`,
    );
    this.name = 'InvalidDurationError';
  }
}

export function validateCustomDuration(seconds: number): number {
  if (
    !Number.isInteger(seconds) ||
    seconds < MIN_CUSTOM_DURATION_SECONDS ||
    seconds > MAX_CUSTOM_DURATION_SECONDS
  ) {
    throw new InvalidDurationError(seconds);
  }
  return seconds;
}

export function grantDurationSeconds(grant: Grant): number | null {
  if (grant.condition === 'expirable_custom') {
    return grant.durationSeconds ?? null;
  }
  return FIXED_CONDITION_SECONDS[grant.condition] ?? null;
}

export function isGrantExpired(grant: Grant, nowSeconds: number): boolean {
  const duration = grantDurationSeconds(grant);
  if (duration === null) {
    return false;
  }
  return nowSeconds >= grant.createdAt + duration;
}

export function makeGrant(
  capability: Capability,
  condition: GrantCondition,
  nowSeconds: number,
  durationSeconds?: number,
): Grant {
  if (condition === 'single') {
    throw new Error('single-use approvals are never stored as grants');
  }
  const grant: Grant = {
    condition,
    level: CAPABILITY_LEVEL[capability],
    createdAt: nowSeconds,
  };
  if (condition === 'expirable_custom') {
    grant.durationSeconds = validateCustomDuration(durationSeconds ?? 0);
  }
  return grant;
}

export function decideCapability(
  grant: Grant | undefined,
  capability: Capability,
  nowSeconds: number,
): Decision {
  if (grant === undefined) {
    return 'ask';
  }
  if (grant.condition === 'no') {
    return 'deny';
  }
  if (isGrantExpired(grant, nowSeconds)) {
    return 'ask';
  }
  return grant.level >= CAPABILITY_LEVEL[capability] ? 'allow' : 'ask';
}

export function pruneExpired(
  permissions: PermissionMap,
  nowSeconds: number,
): { pruned: PermissionMap; changed: boolean } {
  const pruned: PermissionMap = {};
  let changed = false;
  for (const [host, grant] of Object.entries(permissions)) {
    if (isGrantExpired(grant, nowSeconds)) {
      changed = true;
    } else {
      pruned[host] = grant;
    }
  }
  return { pruned, changed };
}
