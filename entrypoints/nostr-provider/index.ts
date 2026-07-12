import {
  EXTENSION_TAG,
  isProviderResponse,
  newRequestId,
  type Capability,
  type EventTemplate,
  type ProviderRequest,
  type RelayMap,
  type SignedEvent,
} from '@/lib/protocol';

export interface NostrProvider {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<SignedEvent>;
  getRelays(): Promise<RelayMap>;
  nip04: {
    encrypt(peer: string, plaintext: string): Promise<string>;
    decrypt(peer: string, ciphertext: string): Promise<string>;
  };
  nip44: {
    encrypt(peer: string, plaintext: string): Promise<string>;
    decrypt(peer: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: NostrProvider;
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export interface Provider {
  nostr: NostrProvider;
  deliver: (data: unknown) => void;
  pendingCount: () => number;
}

export function createProvider(
  post: (request: ProviderRequest) => void,
): Provider {
  const pending = new Map<string, PendingRequest>();

  function call(type: Capability, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = newRequestId();
      pending.set(id, { resolve, reject });
      post({ id, ext: EXTENSION_TAG, type, params });
    });
  }

  const nostr: NostrProvider = {
    async getPublicKey() {
      return (await call('getPublicKey', {})) as string;
    },
    async signEvent(event) {
      return (await call('signEvent', { event })) as SignedEvent;
    },
    async getRelays() {
      return (await call('getRelays', {})) as RelayMap;
    },
    nip04: {
      async encrypt(peer, plaintext) {
        return (await call('nip04.encrypt', {
          peer,
          payload: plaintext,
        })) as string;
      },
      async decrypt(peer, ciphertext) {
        return (await call('nip04.decrypt', {
          peer,
          payload: ciphertext,
        })) as string;
      },
    },
    nip44: {
      async encrypt(peer, plaintext) {
        return (await call('nip44.encrypt', {
          peer,
          payload: plaintext,
        })) as string;
      },
      async decrypt(peer, ciphertext) {
        return (await call('nip44.decrypt', {
          peer,
          payload: ciphertext,
        })) as string;
      },
    },
  };

  function deliver(data: unknown): void {
    if (!isProviderResponse(data)) {
      return;
    }
    const request = pending.get(data.id);
    if (request === undefined) {
      return;
    }
    pending.delete(data.id);
    if (data.error !== undefined) {
      request.reject(new Error(`${EXTENSION_TAG}: ${data.error}`));
    } else {
      request.resolve(data.response);
    }
  }

  return { nostr, deliver, pendingCount: () => pending.size };
}

export default defineUnlistedScript(() => {
  const { nostr, deliver } = createProvider((request) => {
    window.postMessage(request, '*');
  });
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) {
      return;
    }
    deliver(event.data);
  });
  window.nostr = nostr;
});
