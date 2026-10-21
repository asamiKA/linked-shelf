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
 * NDL OpenSearch APIを叩いてShelfNodeを構築する
 * @param {Object} params - 検索パラメータ (例: { title: '量子力学', ndlc: 'MC21', cnt: 5 })
 * @returns {Promise<Object>} ShelfNodeオブジェクト { id, books, edges }
 */
export async function fetchShelfByOpenSearch(params = {}) {
    const baseUrl = 'https://ndlsearch.ndl.go.jp/api/opensearch';
    
    // デフォルトパラメータの補完とURLSearchParamsの構築
    const queryParams = new URLSearchParams({
        title: params.title || '物理学',
        cnt: params.cnt || 5,
        ...params
    });

    const url = `${baseUrl}?${queryParams.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        // RSS/XMLの <item> タグから書籍情報を抽出
        const items = Array.from(xmlDoc.querySelectorAll('item'));
        const books = items.map(item => ({
            title: item.querySelector('title')?.textContent || '無題',
            creator: item.querySelector('author')?.textContent || item.querySelector('creator')?.textContent || '著作者不明',
            link: item.querySelector('link')?.textContent || '',
            pubDate: item.querySelector('pubDate')?.textContent || ''
        }));

        // 書籍の組み合わせから一意の64文字ハッシュIDを生成
        const shelfId = await generateShelfId(books);

        return {
            id: shelfId,
            books: books,
            edges: [] // 後続のロジックやアクション定義で動的に付与
        };

    } catch (error) {
        console.error('Failed to fetch NDL OpenSearch API:', error);
        return {
            id: 'error-node',
            books: [{ title: 'データの取得に失敗しました', creator: '', link: '', pubDate: '' }],
            edges: []
        };
    }
}
