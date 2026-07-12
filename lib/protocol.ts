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
