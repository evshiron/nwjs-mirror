
const { createHash } = require('crypto');

function sha512(buf) {

    const hash = createHash('sha512');
    hash.update(buf);
    return hash.digest('hex');

}

Object.assign(module.exports, {
    sha512: sha512,
});
