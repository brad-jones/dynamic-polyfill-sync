# dynamic-polyfill-sync
[![CircleCI](https://circleci.com/gh/brad-jones/dynamic-polyfill-sync.svg?style=svg)](https://circleci.com/gh/brad-jones/dynamic-polyfill-sync)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)  
[![Build Status](https://saucelabs.com/browser-matrix/dynamic-polyfill-sync.svg)](https://saucelabs.com/u/dynamic-polyfill-sync)

__TLDR:__ A synchronous version of [dynamic-polyfill](https://github.com/PascalAOMS/dynamic-polyfill).

This package provides an IE8+ solution that will run feature detection across
required polyfills, in the event the browser does actully require a polyfill
only then will this use a _"synchronous"_ `XMLHttpRequest` to the
https://polyfill.io service.

## Usage
Download and install with Npm/Yarn:

```
npm install @brad-jones/dynamic-polyfill-sync --save
```

OR

```
yarn add @brad-jones/dynamic-polyfill-sync
```

Then in your library entry point _(usually index.js)_:

```js
import polyfill from '@brad-jones/dynamic-polyfill-sync';
polyfill(['Promise', 'Symbol', 'Object.assign', 'etc...']);

export * from './FooModule';
export * from './BarModule';
```

### Providing a custom polyfill.io url
```js
polyfill(['fills...'], 'https://cdn.custom-polyfill-service.com/v2');
```

## Why?
As a library developer, I want to develop using modern JavaScript standards
but I also want my library to be as compatible as it can be, so like we all do
these days I use a transpiler, usually [TypeScript](https://www.typescriptlang.org/).

However thats only half the story my library also needs to have polyfills
installed when running in older javascript engines. In the past I would have
included these polyfills with my build.

The problem with this is that firstly a modern browser that doesn't require the
polyfills pays the performance hit of having to load them. And secondly if I
have multiple library packages that I want to use they will all duplicate some
of the polyfills.

Read more:

- http://anzorb.com/we-dont-need-your-polyfills/
- https://philipwalton.com/articles/loading-polyfills-only-when-needed/

## Yeah and so...
Well I then came across this project: [dynamic-polyfill](https://github.com/PascalAOMS/dynamic-polyfill).
And I thought it had solved all my problems. And yes if I was building an
__"APP"__ it would solve all my polyfilling needs. But I am building a __"Library"__.

I played around with wrapping my code in a _dynamic-polyfill_ callback, which
worked for sure but it created issues around bundling and just didn't feel nice
to use in a project that was consuming the library.

Now I could tell my library users that they are responsibile for providing the
polyfills but then my package doesn't have a _"just works"_ option, which I
believe is vitally important for intially learning and evaluating a new library.

## Synchronous... really this doen't sound great
Yeah ok I get it Synchronous XHR requests are not best practise due to blocking
the main UI thread of the browser or even the entire browser in some cases.

I believe asking the browser to load it's polyfills synchronously is one of
those acceptable edge cases. The javascript isn't going to work without the
polyfills anyway.

Due to the fact that we perform feature detection, a modern broswer will never
perform the blocking synchronous request.

And so now my library code will _"just work"_.

## Multiple libraries
If you loaded multiple scripts that used this package to load their polyfills,
the first library might load most of the polyfills and the second might only
need to load a few extra ones, again because we are doing feature detection.
So yes multiple requests might end up being made to https://polyfill.io but
not for the same content.

## Know Issues
Actually after heaps of testing (via SauceLabs / BrowserStack), it appears that IE8 & 9 will load a CORS resource so long as it is over HTTPS, using the normal old `XMLHttpRequest`.

I actually had it all working in IE8 with `XDomainRequest` but it would not work in IE9. I then dropped the use of `XDomainRequest` altogether and it worked in both IE8 & 9.

Honestly I still don't get it as it appears to contradict all the documnetation. Until someone comes along and says it doesn't work I am not going to look at it any further.

~~IE8 & 9 do not offer a standards compliant CORS implementation of `XMLHttpRequest`.
Instead we use `XDomainRequest` which works but there are a few restrictions.~~

> 7. ~~Requests must be targeted to the same scheme as the hosting page.
     This restriction means that if your AJAX page is at http://example.com,
     then your target URL must also begin with HTTP. Similarly, if your
     AJAX page is at https://example.com, then your target URL must also
     begin with HTTPS.~~

~~Read more: https://goo.gl/GPY87s~~
