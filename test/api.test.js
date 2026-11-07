import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchShelfBySru } from '../src/api.js';

test('uses the URL issued-year start in the NDL search query', async t => {
    const originalParser = globalThis.DOMParser;
    const originalFetch = globalThis.fetch;
    let requestUrl;

    globalThis.DOMParser = class {
        parseFromString() {
            return {
                documentElement: { localName: 'searchRetrieveResponse' },
                getElementsByTagName: () => [],
                getElementsByTagNameNS: () => []
            };
        }
    };
    globalThis.fetch = async url => {
        requestUrl = url;
        return { ok: true, text: async () => '<searchRetrieveResponse />' };
    };
    t.after(() => {
        globalThis.DOMParser = originalParser;
        globalThis.fetch = originalFetch;
    });

    await fetchShelfBySru({
        ndlc: 'A',
        fromYear: 1000,
        startRecord: 1,
        cnt: 1
    });

    assert.match(new URL(requestUrl).searchParams.get('query'), /from = "1000"/);
});
