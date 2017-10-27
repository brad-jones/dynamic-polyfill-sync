declare var XDomainRequest;

const POLYFILL_SERVICE = 'https://cdn.polyfill.io/v2';

function corsXHR(url: string): string
{
    var corsXhr: XMLHttpRequest = null;

    // For IE10+ and any sane browser
    if (XMLHttpRequest)
    {
        var xhr = new XMLHttpRequest();
        if ('withCredentials' in xhr)
        {
            corsXhr = xhr;
        }
    }

    // For IE8 & 9
    if (corsXhr === null && XDomainRequest)
    {
        corsXhr = new XDomainRequest();
    }

    // Load the url in a synchronous fashion.
    corsXhr.open('GET', url, false);
    corsXhr.send();

    // XDomainRequest does not actually support the third argument to the
    // open method but we do seem to be able to block here and achieve
    // the same result.
    while (corsXhr.responseText.length === 0);

    return corsXhr.responseText;
}

export default function polyfill(fills: string[], customPolyFillService: string = POLYFILL_SERVICE): void
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
    eval(corsXHR(`${customPolyFillService}/polyfill.min.js?features=${needsPolyfill.join(',')}`));
}
