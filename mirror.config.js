
const { dirname, join } = require('path');

module.exports = {
    port: 8888,
    srcUrl: 'http://dl.nwjs.io',
    destDir: join(dirname(module.filename), 'public'),
    urlFilter: (url) => {
        return !/live-build/.test(url)
        && !/xdk/.test(url)
        && !/symbol/.test(url)
        && !/nacl/.test(url)
        && !/alpha/.test(url)
        && !/beta/.test(url)
        && !/v0\.8/.test(url)
        && !/v0\.9/.test(url)
        && !/v0\.10/.test(url)
        && !/v0\.11/.test(url)
        && /(v0\.12\.3|v0\.13\.4|v0\.14\.7|v0\.15\.4|v0\.16\.0)/.test(url);
    },
};
