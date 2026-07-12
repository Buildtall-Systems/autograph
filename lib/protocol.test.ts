import { describe, expect, it } from 'vitest';
import {
  EXTENSION_TAG,
  REQUEST_ID_BYTES,
  isBackgroundRequest,
  isBackgroundResponse,
  isCipherParams,
  isEventTemplate,
  isProviderRequest,
  isProviderResponse,
  isSignEventParams,
  newRequestId,
} from './protocol';

const TEMPLATE = {
  kind: 1,
  created_at: 1_700_000_000,
  tags: [['t', 'test']],
  content: 'hello',
};

describe('newRequestId', () => {
  it('emits lowercase hex of the declared byte length', () => {
    const id = newRequestId();
    expect(id).toMatch(
      new RegExp(`^[0-9a-f]{${String(REQUEST_ID_BYTES * 2)}}$`),
    );
  });

  it('does not repeat across mints', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newRequestId()));
    expect(ids.size).toBe(100);
  });
});

describe('isEventTemplate', () => {
  it('accepts a minimal template', () => {
    expect(isEventTemplate(TEMPLATE)).toBe(true);
  });

  it('accepts an optional pubkey', () => {
    expect(isEventTemplate({ ...TEMPLATE, pubkey: 'a'.repeat(64) })).toBe(true);
  });

  it('rejects missing created_at', () => {
    const { created_at, ...rest } = TEMPLATE;
    void created_at;
    expect(isEventTemplate(rest)).toBe(false);
  });

  it('rejects non-string tag entries', () => {
    expect(isEventTemplate({ ...TEMPLATE, tags: [[1]] })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isEventTemplate('event')).toBe(false);
    expect(isEventTemplate(null)).toBe(false);
  });
});

describe('param guards', () => {
  it('isSignEventParams requires a template under event', () => {
    expect(isSignEventParams({ event: TEMPLATE })).toBe(true);
    expect(isSignEventParams({ event: {} })).toBe(false);
    expect(isSignEventParams({})).toBe(false);
  });

  it('isCipherParams requires peer and payload strings', () => {
    expect(isCipherParams({ peer: 'a'.repeat(64), payload: 'x' })).toBe(true);
    expect(isCipherParams({ peer: 'a'.repeat(64) })).toBe(false);
    expect(isCipherParams({ payload: 'x' })).toBe(false);
  });
});

describe('isProviderRequest', () => {
  const request = {
    id: newRequestId(),
    ext: EXTENSION_TAG,
    type: 'getPublicKey',
    params: {},
  };

  it('accepts a well-formed request', () => {
    expect(isProviderRequest(request)).toBe(true);
  });

  it('rejects a foreign extension tag', () => {
    expect(isProviderRequest({ ...request, ext: 'other' })).toBe(false);
  });

  it('rejects an unknown capability', () => {
    expect(isProviderRequest({ ...request, type: 'nip46.connect' })).toBe(
      false,
    );
  });

  it('rejects missing params', () => {
    expect(
      isProviderRequest({
        id: request.id,
        ext: EXTENSION_TAG,
        type: 'getPublicKey',
      }),
    ).toBe(false);
  });
});

describe('isProviderResponse', () => {
  it('accepts a response payload', () => {
    expect(
      isProviderResponse({ id: 'x', ext: EXTENSION_TAG, response: 'pk' }),
    ).toBe(true);
  });

  it('accepts an error payload', () => {
    expect(
      isProviderResponse({ id: 'x', ext: EXTENSION_TAG, error: 'denied' }),
    ).toBe(true);
  });

  it('rejects a request echo', () => {
    expect(
      isProviderResponse({
        id: 'x',
        ext: EXTENSION_TAG,
        type: 'getPublicKey',
        params: {},
      }),
    ).toBe(false);
  });

  it('rejects payloads with neither response nor error', () => {
    expect(isProviderResponse({ id: 'x', ext: EXTENSION_TAG })).toBe(false);
  });
});

describe('isBackgroundRequest', () => {
  it('accepts a stamped request', () => {
    expect(
      isBackgroundRequest({ type: 'signEvent', params: {}, host: 'drss.io' }),
    ).toBe(true);
  });

  it('rejects an empty host', () => {
    expect(
      isBackgroundRequest({ type: 'signEvent', params: {}, host: '' }),
    ).toBe(false);
  });

  it('rejects a missing host', () => {
    expect(isBackgroundRequest({ type: 'signEvent', params: {} })).toBe(false);
  });
});

describe('isBackgroundResponse', () => {
  it('accepts response and error forms', () => {
    expect(isBackgroundResponse({ response: 'pk' })).toBe(true);
    expect(isBackgroundResponse({ error: 'denied' })).toBe(true);
  });

  it('rejects scalars and empty objects', () => {
    expect(isBackgroundResponse(42)).toBe(false);
    expect(isBackgroundResponse({})).toBe(false);
  });
});
