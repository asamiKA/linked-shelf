const COLORS = [
    '#254b73',
    '#7a3131',
    '#4d6333',
    '#5a3d72',
    '#276466',
    '#805128',
    '#3e4b7c',
    '#704653',
    '#3c6856',
    '#6d5730'
];

function hash(value) {
    let result = 2166136261;
    for (const character of value) {
        result ^= character.codePointAt(0);
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
}

function normalize(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function getBookDesign(book) {
    const key = normalize(book.series) || normalize(book.title) || '無題';
    const value = hash(key);

    return {
        color: COLORS[value % COLORS.length],
        height: 132 + value % 49
    };
}
