import { describe, expect, it } from 'vitest';
import { EXTENSION_TAG, type ProviderRequest } from '@/lib/protocol';
import { createProvider, type Provider } from './index';

function providerWithOutbox(): {
  provider: Provider;
  posted: ProviderRequest[];
} {
  const posted: ProviderRequest[] = [];
  const provider = createProvider((request) => posted.push(request));
  return { provider, posted };
}

function lastPosted(posted: ProviderRequest[]): ProviderRequest {
  const request = posted[posted.length - 1];
  if (request === undefined) {
    throw new Error('nothing posted');
  }
  return request;
}

describe('createProvider', () => {
  it('resolves getPublicKey from a correlated response', async () => {
    const { provider, posted } = providerWithOutbox();
    const promise = provider.nostr.getPublicKey();
    const request = lastPosted(posted);
    expect(request.ext).toBe(EXTENSION_TAG);
    expect(request.type).toBe('getPublicKey');
    provider.deliver({ id: request.id, ext: EXTENSION_TAG, response: 'pk' });
    await expect(promise).resolves.toBe('pk');
    expect(provider.pendingCount()).toBe(0);
  });

  it('rejects with the propagated error message', async () => {
    const { provider, posted } = providerWithOutbox();
    const promise = provider.nostr.signEvent({
      kind: 1,
      created_at: 1_700_000_000,
      tags: [],
      content: 'hi',
    });
    const request = lastPosted(posted);
    provider.deliver({ id: request.id, ext: EXTENSION_TAG, error: 'denied' });
    await expect(promise).rejects.toThrow(`${EXTENSION_TAG}: denied`);
  });

  it('correlates concurrent requests by id', async () => {
    const { provider, posted } = providerWithOutbox();
    const first = provider.nostr.getPublicKey();
    const second = provider.nostr.getRelays();
    expect(posted).toHaveLength(2);
    const [requestA, requestB] = posted;
    if (requestA === undefined || requestB === undefined) {
      throw new Error('missing requests');
    }
    expect(requestA.id).not.toBe(requestB.id);
    provider.deliver({ id: requestB.id, ext: EXTENSION_TAG, response: {} });
    provider.deliver({ id: requestA.id, ext: EXTENSION_TAG, response: 'pk' });
    await expect(first).resolves.toBe('pk');
    await expect(second).resolves.toEqual({});
  });

  it('maps cipher arguments onto peer and payload params', () => {
    const { provider, posted } = providerWithOutbox();
    void provider.nostr.nip44.encrypt('a'.repeat(64), 'secret message');
    const request = lastPosted(posted);
    expect(request.type).toBe('nip44.encrypt');
    expect(request.params).toEqual({
      peer: 'a'.repeat(64),
      payload: 'secret message',
    });
    void provider.nostr.nip04.decrypt('b'.repeat(64), 'ciphertext');
    expect(lastPosted(posted).type).toBe('nip04.decrypt');
    expect(lastPosted(posted).params).toEqual({
      peer: 'b'.repeat(64),
      payload: 'ciphertext',
    });
  });

  it('ignores foreign tags, unknown ids, and request echoes', async () => {
    const { provider, posted } = providerWithOutbox();
    const promise = provider.nostr.getPublicKey();
    const request = lastPosted(posted);
    provider.deliver({ id: request.id, ext: 'other', response: 'evil' });
    provider.deliver({ id: 'unknown', ext: EXTENSION_TAG, response: 'evil' });
    provider.deliver(request);
    provider.deliver(null);
    expect(provider.pendingCount()).toBe(1);
    provider.deliver({ id: request.id, ext: EXTENSION_TAG, response: 'pk' });
    await expect(promise).resolves.toBe('pk');
  });

  it('drops duplicate responses after settlement', async () => {
    const { provider, posted } = providerWithOutbox();
    const promise = provider.nostr.getPublicKey();
    const request = lastPosted(posted);
    provider.deliver({ id: request.id, ext: EXTENSION_TAG, response: 'pk' });
    provider.deliver({ id: request.id, ext: EXTENSION_TAG, error: 'late' });
    await expect(promise).resolves.toBe('pk');
  });
});
