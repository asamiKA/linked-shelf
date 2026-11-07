const DEFAULT_SEARCH_PARAMS = {
    ndlc: 'A',
    fromYear: 1000,
    startRecord: 1
};

function parsePositiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export function parseSearchRoute(pathname) {
    const segments = pathname.split('/').filter(Boolean).map(segment => {
        try {
            return decodeURIComponent(segment);
        } catch {
            return segment;
        }
    });

    for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(segments[index])) continue;

        const parameters = segments.slice(index + 1);
        if (parameters.length > 2 || parameters.some(value => !/^\d+$/.test(value))) continue;

        return {
            basePath: `/${segments.slice(0, index).join('/')}`,
            params: {
                ndlc: segments[index],
                fromYear: Math.max(
                    DEFAULT_SEARCH_PARAMS.fromYear,
                    parsePositiveInteger(parameters[0], DEFAULT_SEARCH_PARAMS.fromYear)
                ),
                startRecord: parsePositiveInteger(
                    parameters[1],
                    DEFAULT_SEARCH_PARAMS.startRecord
                )
            }
        };
    }

    return {
        basePath: `/${segments.join('/')}`.replace(/\/$/, '') || '/',
        params: { ...DEFAULT_SEARCH_PARAMS }
    };
}

export function buildSearchPath(basePath, params) {
    const prefix = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
    return `${prefix}/${encodeURIComponent(params.ndlc)}/${params.fromYear}/${params.startRecord}/`;
}

export function getNextNdlcCode(ndlc) {
    const numericCode = ndlc.match(/^(.*?)(\d+)$/);
    if (numericCode) {
        return `${numericCode[1]}${String(Number(numericCode[2]) + 1).padStart(numericCode[2].length, '0')}`;
    }

    const characters = Array.from(ndlc);
    for (let index = characters.length - 1; index >= 0; index -= 1) {
        const character = characters[index];
        if (character >= 'A' && character < 'Z') {
            characters[index] = String.fromCharCode(character.charCodeAt(0) + 1);
            return characters.join('');
        }
        if (character === 'Z') {
            characters[index] = 'A';
            continue;
        }
        if (character >= 'a' && character < 'z') {
            characters[index] = String.fromCharCode(character.charCodeAt(0) + 1);
            return characters.join('');
        }
        if (character === 'z') {
            characters[index] = 'a';
            continue;
        }
        return ndlc;
    }

    return `A${characters.join('')}`;
}
