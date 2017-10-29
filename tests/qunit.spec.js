QUnit.test("EnsurePackageLoadedIntoWindow", function(assert)
{
    assert.ok(window['@brad-jones/dynamic-polyfill-sync']);
});

/*QUnit.test("EnsureSymbolPolyfillLoads", function(assert)
{
    window['@brad-jones/dynamic-polyfill-sync'](['Symbol']);
    assert.ok(Symbol);
});*/
