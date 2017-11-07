const POLYFILL_SERVICE = 'https://cdn.polyfill.io/v2';

function getSync(url: string): string
{
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send();
    return xhr.responseText;
}

export function polyfill(fills: string[], customPolyFillService: string = POLYFILL_SERVICE): void
{
    // First perform the the feature detection
    var needsPolyfill = [];
    for (var i = 0; i < fills.length; i++)
    {
        var obj = window, segments = fills[i].split('.');
        for (var i2 = 0; i2 < segments.length; i2++)
        {
            obj = obj[segments[i2]];
            if (obj === undefined)
            {
                needsPolyfill.push(fills[i]); break;
            }
        }
    }

    // No polyfills are required so bail out early.
    if (needsPolyfill.length === 0) return;

    // Finally load and eval the required polyfills
    eval(getSync(`${customPolyFillService}/polyfill.min.js?features=${needsPolyfill.join('|always|gated,')}|always|gated`));
}
