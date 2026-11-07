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
        ndlc: 'A1',
        fromYear: 1000,
        startRecord: 1,
        cnt: 1
    });

    assert.match(new URL(requestUrl).searchParams.get('query'), /from = "1000"/);
});

test('limits prefetched records to one maximum API request', async t => {
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

    const node = await fetchShelfBySru({
        ndlc: 'PREFETCH_LIMIT_TEST',
        fromYear: 1000,
        startRecord: 1,
        cnt: 100,
        prefetch: true
    });

    assert.equal(new URL(requestUrl).searchParams.get('maximumRecords'), '50');
    assert.equal(node.debug.endRecord, 50);
});

test('uses a descending issued-year upper bound for older shelf searches', async t => {
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

    const node = await fetchShelfBySru({
        ndlc: 'OLDER_TEST',
        untilYear: 1980,
        cnt: 1
    });
    const query = new URL(requestUrl).searchParams.get('query');

    assert.match(query, /sortBy = issued_date\/sort\.descending/);
    assert.match(query, /until = "1980"/);
    assert.doesNotMatch(query, /from =/);
    assert.equal(node.debug.exhausted, true);
});
