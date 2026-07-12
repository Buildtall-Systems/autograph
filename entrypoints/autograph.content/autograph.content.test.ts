import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  EXTENSION_TAG,
  newRequestId,
  type BackgroundRequest,
  type ProviderRequest,
} from '@/lib/protocol';
import { relayToBackground } from './index';

function pageRequest(): ProviderRequest {
  return {
    id: newRequestId(),
    ext: EXTENSION_TAG,
    type: 'getPublicKey',
    params: {},
  };
}

describe('relayToBackground', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('stamps the host and returns the background response', async () => {
    const received: BackgroundRequest[] = [];
    fakeBrowser.runtime.onMessage.addListener((message: unknown) => {
      received.push(message as BackgroundRequest);
      return Promise.resolve({ response: 'pk' });
    });
    const request = pageRequest();
    const response = await relayToBackground(request, 'drss.io');
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      type: 'getPublicKey',
      params: {},
      host: 'drss.io',
    });
    expect(response).toEqual({
      id: request.id,
      ext: EXTENSION_TAG,
      response: 'pk',
    });
  });

  it('passes background errors through as protocol errors', async () => {
    fakeBrowser.runtime.onMessage.addListener(() =>
      Promise.resolve({ error: 'vault is locked' }),
    );
    const request = pageRequest();
    const response = await relayToBackground(request, 'drss.io');
    expect(response).toEqual({
      id: request.id,
      ext: EXTENSION_TAG,
      error: 'vault is locked',
    });
  });

  it('reports a malformed background response', async () => {
    fakeBrowser.runtime.onMessage.addListener(() => Promise.resolve(42));
    const response = await relayToBackground(pageRequest(), 'drss.io');
    expect(response.error).toBe('malformed background response');
  });

  it('converts a rejected send into a protocol error', async () => {
    fakeBrowser.runtime.onMessage.addListener(() =>
      Promise.reject(new Error('background exploded')),
    );
    const response = await relayToBackground(pageRequest(), 'drss.io');
    expect(response.error).toBe('background exploded');
  });
});
