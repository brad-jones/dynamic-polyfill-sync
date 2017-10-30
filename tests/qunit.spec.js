QUnit.test("EnsurePackageLoadedIntoWindow", function(assert)
{
    assert.ok(window['@brad-jones/dynamic-polyfill-sync']);
});

QUnit.test("EnsureSymbolPolyfillLoads", function(assert)
{
    window['@brad-jones/dynamic-polyfill-sync'].polyfill(['Symbol']);
    assert.ok(Symbol);
});

QUnit.test("EnsurePromisePolyfillLoads", function(assert)
{
    window['@brad-jones/dynamic-polyfill-sync'].polyfill(['Promise']);
    assert.ok(Promise);
});

QUnit.test("EnsureArrayPrototypeIncludesPolyfillLoads", function(assert)
{
    window['@brad-jones/dynamic-polyfill-sync'].polyfill(['Array.prototype.includes']);
    assert.ok(Array.prototype.includes);
});
