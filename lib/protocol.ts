export const EXTENSION_TAG = 'autograph';

export const CAPABILITIES = [
  'getPublicKey',
  'getRelays',
  'signEvent',
  'nip04.encrypt',
  'nip04.decrypt',
  'nip44.encrypt',
  'nip44.decrypt',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: unknown): value is Capability {
  return (
    typeof value === 'string' &&
    (CAPABILITIES as readonly string[]).includes(value)
  );
}

export interface EventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey?: string;
}

export interface SignedEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface RelayPolicy {
  read: boolean;
  write: boolean;
}

export type RelayMap = Record<string, RelayPolicy>;

export interface SignEventParams {
  event: EventTemplate;
}

export interface CipherParams {
  peer: string;
  payload: string;
}

export interface ProviderRequest {
  id: string;
  ext: typeof EXTENSION_TAG;
  type: Capability;
  params: unknown;
}

export interface ProviderResponse {
  id: string;
  ext: typeof EXTENSION_TAG;
  response?: unknown;
  error?: string;
}

export interface BackgroundRequest {
  type: Capability;
  params: unknown;
  host: string;
}

export interface BackgroundResponse {
  response?: unknown;
  error?: string;
}

export const REQUEST_ID_BYTES = 16;

export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REQUEST_ID_BYTES));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringMatrix(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        Array.isArray(row) && row.every((item) => typeof item === 'string'),
    )
  );
}

export function isEventTemplate(value: unknown): value is EventTemplate {
  return (
    isRecord(value) &&
    typeof value.kind === 'number' &&
    typeof value.created_at === 'number' &&
    isStringMatrix(value.tags) &&
    typeof value.content === 'string' &&
    (value.pubkey === undefined || typeof value.pubkey === 'string')
  );
}

export function isSignEventParams(value: unknown): value is SignEventParams {
  return isRecord(value) && isEventTemplate(value.event);
}

export function isCipherParams(value: unknown): value is CipherParams {
  return (
    isRecord(value) &&
    typeof value.peer === 'string' &&
    typeof value.payload === 'string'
  );
}

export function isProviderRequest(value: unknown): value is ProviderRequest {
  return (
    isRecord(value) &&
    value.ext === EXTENSION_TAG &&
    typeof value.id === 'string' &&
    isCapability(value.type) &&
    isRecord(value.params)
  );
}

export function isProviderResponse(value: unknown): value is ProviderResponse {
  return (
    isRecord(value) &&
    value.ext === EXTENSION_TAG &&
    typeof value.id === 'string' &&
    !('type' in value) &&
    ('response' in value || typeof value.error === 'string')
  );
}

export function isBackgroundRequest(
  value: unknown,
): value is BackgroundRequest {
  return (
    isRecord(value) &&
    isCapability(value.type) &&
    isRecord(value.params) &&
    typeof value.host === 'string' &&
    value.host.length > 0
  );
}

export function isBackgroundResponse(
  value: unknown,
): value is BackgroundResponse {
  return (
    isRecord(value) && ('response' in value || typeof value.error === 'string')
  );
}
