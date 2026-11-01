export async function generateShelfId(books) {
    const combinedString = books.map(book => book.title || book.id).join('|');
    const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(combinedString)
    );
    return Array.from(new Uint8Array(hashBuffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

const recordCaches = new Map();
const MAX_RECORDS_PER_REQUEST = 50;
const MAX_RECORDS_PER_QUERY = 500;

export async function fetchShelfBySru(params = {}) {
    const baseUrl = 'https://ndlsearch.ndl.go.jp/api/sru';
    const count = Math.max(1, Number(params.cnt) || 5);
    const page = Math.max(1, Number(params.page) || 1);
    const sortDirection = params.sortDirection === 'descending' ? 'descending' : 'ascending';
    const startRecord = Math.max(
        1,
        Number(params.startRecord) || (page - 1) * count + 1
    );
    const endRecord = startRecord + count - 1;
    const initialFromYear = Math.max(1701, Number(params.fromYear) || 1701);
    const quoteCql = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const baseClauses = [
        `title = ${quoteCql(params.title || '物理学')}`,
        'mediatype = "books"',
        `sortBy = issued_date/sort.${sortDirection}`
    ];
    if (params.ndlc) {
        baseClauses.push(`ndlc = ${quoteCql(params.ndlc)}`);
    }

    const buildQuery = fromYear => [
        ...baseClauses,
        `from = "${fromYear}"`
    ].join(' AND ');
    const buildRequestUrl = (query, requestedStartRecord, maximumRecords) => {
        const queryParams = new URLSearchParams({
            operation: 'searchRetrieve',
            version: '1.2',
            recordSchema: 'dcndl',
            recordPacking: 'xml',
            onlyBib: 'true',
            maximumRecords,
            startRecord: requestedStartRecord,
            query
        });
        return `${baseUrl}?${queryParams.toString()}`;
    };
    const cacheKey = `${baseClauses.join(' AND ')}|from=${initialFromYear}`;
    const cache = recordCaches.get(cacheKey) || {
        records: [],
        recordKeys: new Set(),
        fromYear: initialFromYear,
        segmentRecordCount: 0,
        segmentNewRecordCount: 0,
        exhausted: false
    };
    recordCaches.set(cacheKey, cache);

    let requestUrl = buildRequestUrl(buildQuery(cache.fromYear), startRecord, count);
    let cqlQuery = '';
    let responseTimeMs = 0;
    let fetchedRecords = false;

    try {
        const parser = new DOMParser();
        const getElementsByLocalName = (element, name) =>
            Array.from(element.getElementsByTagNameNS('*', name));
        const getText = (element, names) => {
            for (const name of names) {
                const text = getElementsByLocalName(element, name)[0]?.textContent?.trim();
                if (text) return text;
            }
            return '';
        };
        const getPublicationYear = bibResource => {
            const dateValues = ['issued', 'date'].flatMap(name => (
                getElementsByLocalName(bibResource, name).map(element => element.textContent || '')
            ));
            const years = dateValues.flatMap(value => (
                Array.from(value.matchAll(/(?:^|\D)(\d{4})(?!\d)/g), match => Number(match[1]))
            ));
            return years.length ? Math.max(...years) : null;
        };
        const getSeries = bibResource => {
            const series = getText(bibResource, ['seriesTitle', 'series']);
            if (series) return series;

            const parent = getElementsByLocalName(bibResource, 'isPartOf')[0];
            return parent ? getText(parent, ['title']) : '';
        };
        const parseRecords = xmlText => {
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            if (xmlDoc.getElementsByTagName('parsererror').length > 0 ||
                xmlDoc.documentElement?.localName !== 'searchRetrieveResponse') {
                throw new Error('Invalid NDL SRU response');
            }

            return Array.from(
                xmlDoc.getElementsByTagNameNS('http://www.loc.gov/zing/srw/', 'record')
            ).map(record => {
                const bibResource = getElementsByLocalName(record, 'BibResource')[0];
                if (!bibResource) return null;

                const link = bibResource.getAttributeNS(
                    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                    'about'
                )?.replace(/#.*$/, '') || '';
                const book = {
                    title: getText(bibResource, ['title']) || '無題',
                    creator: getText(bibResource, ['creator']) || '著作者不明',
                    link,
                    pubDate: getText(bibResource, ['issued', 'date']),
                    publicationYear: getPublicationYear(bibResource),
                    series: getSeries(bibResource)
                };
                return book;
            }).filter(Boolean);
        };

        while (!cache.exhausted && cache.records.length < endRecord) {
            if (cache.segmentRecordCount === MAX_RECORDS_PER_QUERY) {
                const lastRecord = cache.records.at(-1);
                if (!lastRecord?.publicationYear) {
                    throw new Error('Cannot continue NDL SRU search without a publication year');
                }

                cache.fromYear = cache.segmentNewRecordCount === 0
                    ? lastRecord.publicationYear + 1
                    : lastRecord.publicationYear;
                cache.segmentRecordCount = 0;
                cache.segmentNewRecordCount = 0;
            }

            const maximumRecords = Math.min(
                MAX_RECORDS_PER_REQUEST,
                MAX_RECORDS_PER_QUERY - cache.segmentRecordCount
            );
            const query = buildQuery(cache.fromYear);
            cqlQuery = query;
            requestUrl = buildRequestUrl(
                query,
                cache.segmentRecordCount + 1,
                maximumRecords
            );
            const requestStartedAt = performance.now();
            const response = await fetch(requestUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const records = parseRecords(await response.text());
            responseTimeMs += Math.round(performance.now() - requestStartedAt);
            fetchedRecords = true;
            cache.segmentRecordCount += records.length;
            if (records.length < maximumRecords) cache.exhausted = true;

            for (const record of records) {
                const key = record.link || [
                    record.title,
                    record.creator,
                    record.pubDate
                ].join('\u0000');
                if (!cache.recordKeys.has(key)) {
                    cache.recordKeys.add(key);
                    cache.records.push(record);
                    cache.segmentNewRecordCount += 1;
                }
            }
        }

        const books = cache.records.slice(startRecord - 1, endRecord);
        const shelfId = await generateShelfId(books);

        return {
            id: shelfId,
            books,
            edges: [],
            debug: {
                requestUrl,
                responseTimeMs,
                cached: !fetchedRecords,
                cachedRecordCount: cache.records.length,
                startRecord,
                endRecord,
                fromYear: cache.fromYear,
                cqlQuery: fetchedRecords ? cqlQuery : ''
            }
        };
    } catch (error) {
        console.error('Failed to fetch NDL SRU API:', error);
        return {
            id: 'error-node',
            books: [{ title: 'データの取得に失敗しました', creator: '', link: '', pubDate: '' }],
            edges: [],
            debug: {
                requestUrl,
                responseTimeMs,
                startRecord,
                endRecord
            }
        };
    }
}
