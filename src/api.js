// src/js/api.js

/**
 * 書籍の配列から64文字のSHA-256ハッシュの棚IDを生成する
 * @param {Array} books 
 * @returns {Promise<string>} 64文字の16進数ハッシュ文字列
 */
export async function generateShelfId(books) {
    const combinedString = books.map(b => b.title || b.id).join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * NDL SRU APIを叩いてShelfNodeを構築する
 * @param {Object} params - 検索パラメータ (例: { title: '量子力学', ndlc: 'MC21', cnt: 5 })
 * @returns {Promise<Object>} ShelfNodeオブジェクト { id, books, edges }
 */
export async function fetchShelfBySru(params = {}) {
    const baseUrl = 'https://ndlsearch.ndl.go.jp/api/sru';
    const count = Number(params.cnt) || 5;
    const page = Math.max(1, Number(params.page) || 1);
    const quoteCql = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const clauses = [
        `title = ${quoteCql(params.title || '物理学')}`,
        `mediatype = "books"`
    ];
    if (params.ndlc) {
        clauses.push(`ndlc = ${quoteCql(params.ndlc)}`);
    }

    const queryParams = new URLSearchParams({
        operation: 'searchRetrieve',
        version: '1.2',
        recordSchema: 'dcndl',
        recordPacking: 'xml',
        onlyBib: 'true',
        maximumRecords: count,
        startRecord: (page - 1) * count + 1,
        query: clauses.join(' AND '),
        sortBy: 'issued_date/sort.descending'
    });
    const url = `${baseUrl}?${queryParams.toString()}`;
    const requestStartedAt = performance.now();
    let responseTimeMs;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xmlText = await response.text();
        responseTimeMs = Math.round(performance.now() - requestStartedAt);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        if (xmlDoc.getElementsByTagName('parsererror').length > 0 ||
            xmlDoc.documentElement?.localName !== 'searchRetrieveResponse') {
            throw new Error('Invalid NDL SRU response');
        }

        const getElementsByLocalName = (element, name) =>
            Array.from(element.getElementsByTagNameNS('*', name));
        const getText = (element, names) => {
            for (const name of names) {
                const text = getElementsByLocalName(element, name)[0]?.textContent?.trim();
                if (text) return text;
            }
            return '';
        };
        const books = Array.from(xmlDoc.getElementsByTagNameNS('*', 'record'))
            .map(record => {
                const bibResource = getElementsByLocalName(record, 'BibResource')[0];
                if (!bibResource) return null;
                return {
                    title: getText(bibResource, ['title']) || '無題',
                    creator: getText(bibResource, ['creator']) || '著作者不明',
                    link: bibResource.getAttributeNS(
                        'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                        'about'
                    )?.replace(/#.*$/, '') || '',
                    pubDate: getText(bibResource, ['issued', 'date'])
                };
            })
            .filter(Boolean);

        // 書籍の組み合わせから一意の64文字ハッシュIDを生成
        const shelfId = await generateShelfId(books);

        return {
            id: shelfId,
            books: books,
            edges: [], // 後続のロジックやアクション定義で動的に付与
            debug: { requestUrl: url, responseTimeMs }
        };

    } catch (error) {
        console.error('Failed to fetch NDL SRU API:', error);
        return {
            id: 'error-node',
            books: [{ title: 'データの取得に失敗しました', creator: '', link: '', pubDate: '' }],
            edges: [],
            debug: {
                requestUrl: url,
                responseTimeMs: responseTimeMs ?? Math.round(performance.now() - requestStartedAt)
            }
        };
    }
}
