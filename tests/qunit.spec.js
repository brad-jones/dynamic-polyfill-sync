QUnit.test("EnsurePackageLoadedIntoWindow", function(assert)
{
    assert.ok(window['@brad-jones/dynamic-polyfill-sync']);
});

QUnit.test("EnsureSymbolPolyfillLoads", function(assert)
{
    window['@brad-jones/dynamic-polyfill-sync'](['Symbol']);
    assert.ok(Symbol);
});

QUnit.test("EnsurePromisePolyfillLoads", function(assert)
{
    window['@brad-jones/dynamic-polyfill-sync'](['Promise']);
    assert.ok(Promise);
});

QUnit.test("EnsureArrayPrototypeIncludesPolyfillLoads", function(assert)
{
    window['@brad-jones/dynamic-polyfill-sync'](['Array.prototype.includes']);
    assert.ok(Array.prototype.includes);
});
