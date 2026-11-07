import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildLastViewedShelfPath,
    buildSearchPath,
    getPreviousNdlcCode,
    completeSearchPath,
    getNextNdlcCode,
    isRootSearchPath,
    parseSearchRoute
} from '../src/search-route.js';

test('uses defaults when the URL has no search parameters', () => {
    assert.deepEqual(parseSearchRoute('/'), {
        basePath: '/',
        params: {
            ndlc: 'A1',
            fromYear: 1000,
            startRecord: 1
        }
    });
});

test('parses search parameters after a deployment base path', () => {
    assert.deepEqual(parseSearchRoute('/linked-shelf/MC21/1980/25/'), {
        basePath: '/linked-shelf',
        params: {
            ndlc: 'MC21',
            fromYear: 1980,
            startRecord: 1
        }
    });
});

test('ignores legacy result-order URL segments', () => {
    assert.deepEqual(parseSearchRoute('/A1/1980/25/').params, {
        ndlc: 'A1',
        fromYear: 1980,
        startRecord: 1
    });
});

test('applies defaults to omitted or invalid parameter values', () => {
    assert.deepEqual(parseSearchRoute('/A1/'), {
        basePath: '/',
        params: {
            ndlc: 'A1',
            fromYear: 1000,
            startRecord: 1
        }
    });
    assert.deepEqual(parseSearchRoute('/A1/999/0/'), {
        basePath: '/',
        params: {
            ndlc: 'A1',
            fromYear: 1000,
            startRecord: 1
        }
    });
});

test('builds a trailing-slash search path without a result-order segment', () => {
    assert.equal(
        buildSearchPath('/linked-shelf', {
            ndlc: 'B',
            fromYear: 1000,
            startRecord: 1
        }),
        '/linked-shelf/B/1000/'
    );
});

test('builds a resume path from the leftmost book publication year', () => {
    assert.equal(
        buildLastViewedShelfPath('/linked-shelf', 'MC21', { publicationYear: 1980 }),
        '/linked-shelf/MC21/1980/'
    );
    assert.equal(buildLastViewedShelfPath('/', 'MC21', { publicationYear: null }), null);
});

test('identifies a parameterless root route with or without a deployment base path', () => {
    assert.equal(isRootSearchPath('/', parseSearchRoute('/')), true);
    assert.equal(
        isRootSearchPath('/linked-shelf/', parseSearchRoute('/linked-shelf/')),
        true
    );
    assert.equal(isRootSearchPath('/A1/1000/1/', parseSearchRoute('/A1/1000/1/')), false);
});

test('completes incomplete search paths with defaults', () => {
    assert.equal(completeSearchPath('/'), '/A1/1000/');
    assert.equal(completeSearchPath('/A1/1980/'), '/A1/1980/');
    assert.equal(completeSearchPath('/linked-shelf/MC21/'), '/linked-shelf/MC21/1000/');
    assert.equal(completeSearchPath('/linked-shelf/MC21/1980/25/'), '/linked-shelf/MC21/1980/');
});

test('advances numeric and alphabetic NDLC codes', () => {
    assert.equal(getNextNdlcCode('MC21'), 'MC22');
    assert.equal(getNextNdlcCode('A'), 'B');
    assert.equal(getNextNdlcCode('Z'), 'AA');
});

test('getPreviousNdlcCode decrements NDLC codes', () => {
    assert.equal(getPreviousNdlcCode('MC21'), 'MC20');
    assert.equal(getPreviousNdlcCode('MC0'), null);
    assert.equal(getPreviousNdlcCode('B'), 'A');
    assert.equal(getPreviousNdlcCode('A'), null);
});
