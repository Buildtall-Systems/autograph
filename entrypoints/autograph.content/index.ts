import {
  EXTENSION_TAG,
  isBackgroundResponse,
  isProviderRequest,
  type BackgroundRequest,
  type ProviderRequest,
  type ProviderResponse,
} from '@/lib/protocol';

export async function relayToBackground(
  request: ProviderRequest,
  host: string,
): Promise<ProviderResponse> {
  const backgroundRequest: BackgroundRequest = {
    type: request.type,
    params: request.params,
    host,
  };
  try {
    const result: unknown =
      await browser.runtime.sendMessage(backgroundRequest);
    if (!isBackgroundResponse(result)) {
      return {
        id: request.id,
        ext: EXTENSION_TAG,
        error: 'malformed background response',
      };
    }
    if (result.error !== undefined) {
      return { id: request.id, ext: EXTENSION_TAG, error: result.error };
    }
    return { id: request.id, ext: EXTENSION_TAG, response: result.response };
  } catch (error) {
    return {
      id: request.id,
      ext: EXTENSION_TAG,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_end',
  async main() {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }
      if (!isProviderRequest(event.data)) {
        return;
      }
      const request = event.data;
      const origin = event.origin;
      void relayToBackground(request, location.host).then((response) => {
        window.postMessage(response, origin);
      });
    });
    await injectScript('/nostr-provider.js');
  },
});
