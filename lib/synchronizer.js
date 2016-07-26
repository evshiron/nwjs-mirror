
const { parse: urlParse, format: urlFormat } = require('url');
const { join, dirname, basename, normalize, resolve } = require('path').posix;
const { exists, writeFile, readFile } = require('fs');
const { mkdirs } = require('fs-extra');
const { EventEmitter } = require('events');

const request = require('request');
const cheerio = require('cheerio');

const Flow = require('node-async-flow');

let t = 0;
const STATUS_SUCCESS = t++;
const STATUS_FAILURE = t++;
const STATUS_EXISTS = t++;

class SynchronizeResult {

    constructor({
        type = null,
        filename = null,
        url = null,
        path = null,
        status = null,
    }) {

        this.type = type;
        this.filename = filename;
        this.url = url;
        this.path = path;
        this.status = status;

    }

}

// Should work for Apache 2.
class Synchronizer extends EventEmitter {

    constructor({
        srcUrl, destDir, urlFilter,
    }) {
        super();

        this.srcUrl = srcUrl;
        this.destDir = destDir;
        this.urlFilter = urlFilter;

    }

    getLocalPath(url) {

        const parsedRootUrl = urlParse(this.srcUrl);
        const parsedUrl = urlParse(url);

        return join(this.destDir, resolve(parsedRootUrl.pathname, parsedUrl.pathname));

    }

    // NOTE: http://dl.nwjs.io/live-build/ is deployed on Amazon S3.

    syncDir(url, callback) {

        Flow(function*(cb) {

            console.info('url', url);

            const [err, res, body] = yield request(url, cb.expect(3));

            if(err) {
                return callback(err);
            }

            const $ = cheerio.load(body);
            const $trs = $('tr').slice(2);

            const files = [];

            $trs.each((idx, el) => {
                const filename = $(el).find('td').eq(1).text();
                if(filename && filename != 'Parent Directory') {
                    files.push(filename);
                }
            });

            const urls = files.map(file => {
                let parsedUrl = urlParse(`${ url }/${ file }`);
                parsedUrl.pathname = normalize(parsedUrl.pathname);
                return urlFormat(parsedUrl);
            });

            let synchronizeResults = [];

            for(let url of urls) {

                if(!this.urlFilter(url)) {
                    console.info('skip', url);
                    continue;
                }

                if(url.endsWith('/')) {

                    const [err, results] = yield this.syncDir(url, cb.expect(2));

                    if(err) {
                        return callback(err);
                    }

                    synchronizeResults = [...synchronizeResults, ...results];

                }
                else {

                    const [err, result] = yield this.syncFile(url, cb.expect(2));

                    if(err) {
                        return callback(err);
                    }

                    synchronizeResults.push(result);

                }

            }

            callback(null, synchronizeResults);

        }.bind(this));

    }

    syncFile(url, callback) {

        Flow(function*(cb) {

            const path = this.getLocalPath(url);

            console.info('path', path);

            if(yield exists(path, cb.single)) {
                return callback(null, new SynchronizeResult({
                    type: 'file',
                    filename: basename(path),
                    url: url,
                    path: path,
                    status: STATUS_EXISTS,
                }));
            }

            {

                const err = yield mkdirs(dirname(path), cb.single);

                if(err) {
                    return callback(err);
                }

            }

            const [err, res, body] = yield request(url, cb.expect(3));

            if(err) {
                return callback(err);
            }

            if(res.statusCode != 200) {
                return callback(new Error(`ERROR_STATUS_${ res.statusCode }`));
            }

            {

                const err = writeFile(path, body, cb.single);

                if(err) {
                    return callback(err);
                }

            }

            callback(null, new SynchronizeResult({
                type: 'file',
                filename: basename(path),
                url: url,
                path: path,
                status: STATUS_SUCCESS,
            }));

        }.bind(this));

    }

    syncAll(callback) {
        this.syncDir(this.srcUrl, callback);
    }

    start() {

    }

}

module.exports = Synchronizer;
