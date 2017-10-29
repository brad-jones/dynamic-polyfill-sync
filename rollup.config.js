import uglify from 'rollup-plugin-uglify';
import typescript from 'rollup-plugin-typescript2';

const pkg = require(`${__dirname}/package.json`);

export default
{
    input: './src/index.ts',
    output:
    {
        name: pkg.name,
        file: './dist/index.js',
        format: 'umd'
    },
    plugins:
    [
        typescript
        ({
            tsconfig: './src/tsconfig.json',
            typescript: require('typescript'),
            clean: true
        }),
        uglify({ ie8:true })
    ],
    sourcemap: true,
    onwarn(warning)
    {
        if (warning.code === 'EVAL') return;
        console.warn(warning.message);
    }
}
