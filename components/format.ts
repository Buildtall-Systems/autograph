import {
  CAPABILITY_LEVEL,
  grantDurationSeconds,
  validateCustomDuration,
  type Grant,
  type GrantCondition,
} from '@/lib/permissions';
import { CAPABILITIES, type Capability } from '@/lib/protocol';

export const TRUNCATE_HEAD_CHARS = 12;
export const TRUNCATE_TAIL_CHARS = 6;

export function truncateMiddle(
  value: string,
  head: number = TRUNCATE_HEAD_CHARS,
  tail: number = TRUNCATE_TAIL_CHARS,
): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  getPublicKey: 'read your public key',
  getRelays: 'read your relay list',
  signEvent: 'sign events',
  'nip04.encrypt': 'encrypt messages (NIP-04)',
  'nip04.decrypt': 'decrypt messages (NIP-04)',
  'nip44.encrypt': 'encrypt messages (NIP-44)',
  'nip44.decrypt': 'decrypt messages (NIP-44)',
};

export function capabilitiesAtLevel(level: number): Capability[] {
  return CAPABILITIES.filter(
    (capability) => CAPABILITY_LEVEL[capability] <= level,
  );
}

export function levelLabel(level: number): string {
  const granted = capabilitiesAtLevel(level);
  if (granted.length === 0) {
    return 'nothing';
  }
  return granted.map((capability) => CAPABILITY_LABEL[capability]).join(', ');
}

export const CONDITION_LABEL: Record<GrantCondition, string> = {
  forever: 'forever',
  expirable_5m: '5 minutes',
  expirable_1h: '1 hour',
  expirable_8h: '8 hours',
  expirable_custom: 'custom',
  single: 'once',
  no: 'denied',
};

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: SECONDS_PER_MINUTE,
  h: SECONDS_PER_HOUR,
  d: SECONDS_PER_DAY,
};

const DURATION_INPUT_PATTERN = /^(\d+)\s*([smhd])$/i;

export class InvalidDurationInputError extends Error {
  constructor(input: string) {
    super(
      `duration must be a number followed by s, m, h, or d (e.g. "90m"), got "${input}"`,
    );
    this.name = 'InvalidDurationInputError';
  }
}

export function parseDurationInput(input: string): number {
  const match = DURATION_INPUT_PATTERN.exec(input.trim());
  if (match === null) {
    throw new InvalidDurationInputError(input);
  }
  const amount = Number.parseInt(match[1] ?? '', 10);
  const unit = (match[2] ?? '').toLowerCase();
  const unitSeconds = DURATION_UNIT_SECONDS[unit];
  if (unitSeconds === undefined) {
    throw new InvalidDurationInputError(input);
  }
  return validateCustomDuration(amount * unitSeconds);
}

export function formatRemaining(seconds: number): string {
  if (seconds >= SECONDS_PER_DAY) {
    return `${String(Math.floor(seconds / SECONDS_PER_DAY))} d`;
  }
  if (seconds >= SECONDS_PER_HOUR) {
    return `${String(Math.floor(seconds / SECONDS_PER_HOUR))} h`;
  }
  if (seconds >= SECONDS_PER_MINUTE) {
    return `${String(Math.floor(seconds / SECONDS_PER_MINUTE))} m`;
  }
  return `${String(seconds)} s`;
}

export function grantExpiryLabel(grant: Grant, nowSeconds: number): string {
  const duration = grantDurationSeconds(grant);
  if (duration === null) {
    return 'never';
  }
  const remaining = grant.createdAt + duration - nowSeconds;
  if (remaining <= 0) {
    return 'expired';
  }
  return `in ${formatRemaining(remaining)}`;
}
