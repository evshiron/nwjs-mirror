
const { parse: urlParse, format: urlFormat } = require('url');
const { queryStringify } = require('querystring');
const { join, dirname, basename, normalize, resolve } = require('path').posix;
const { exists, writeFile, readFile } = require('fs');
const { mkdirs } = require('fs-extra');
const { EventEmitter } = require('events');

const request = require('request');
const cheerio = require('cheerio');
const progress = require('request-progress');
const ProgressBar = require('progress');

const Flow = require('node-async-flow');

let t = 0;
const STATUS_SUCCESS = t++;
const STATUS_FAILURE = t++;
const STATUS_EXISTS = t++;

function progressedRequest(url, callback) {

    let progressbar = null;

    progress(request(url, callback))
    .on('response', (res) => {

        progressbar = new ProgressBar('[:bar] :speedKB/s @ :remainings', {
            total: parseInt(res.headers['content-length']),
            speed: 0,
            remaining: 0,
        });

        console.info(`Downloading ${ url }...`);

    })
    .on('progress', (progress) => {
        progressbar.tick(progress.size.transfered - progressbar.curr, {
            speed: (progress.speed / 1000).toFixed(2),
            remaining: progress.time.remaining ? progress.time.remaining.toFixed(2) : -1,
        });
    })
    .on('end', () => {
        console.info('\n');
    });

}

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

    syncUrls(urls, callback) {

        Flow(function*(cb) {

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

    syncDir(url, callback) {

        Flow(function*(cb) {

            console.info('url', url);

            const [err, res, body] = yield request(url, cb.expect(3));

            if(err) {
                return callback(err);
            }

            if(/Apache/.test(body)) {

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

                return this.syncUrls(urls, callback);

            }
            else if(/S3/.test(body)) {

                const bucketName = /bucketName\s*:\s*'([^']+)'/.exec(body)[1];
                const bucketEndpoint = /bucketEndpoint\s*:\s*'([^']+)'/.exec(body)[1];

                if(!bucketName || !bucketEndpoint) {
                    return callback(new Error('ERROR_PARSE_BUCKET'));
                }

                const parsedUrl = urlParse(url);
                const bucketUrl = urlParse(`https://${ bucketName }.${ bucketEndpoint }/`);
                bucketUrl.query = {
                    delimiter: '/',
                    prefix: parsedUrl.pathname.replace(/^\//, ''),
                };

                const [err, res, xml] = yield request(urlFormat(bucketUrl), cb.expect(3));

                if(err) {
                    return callback(err);
                }

                const $ = cheerio.load(xml);
                const $keys = $('Key');

                const files = [];

                $keys.each((idx, el) => {
                    const filename = $(el).text().replace(bucketUrl.query.prefix, '');
                    if(filename) {
                        files.push(filename);
                    }
                });

                const urls = files.map(file => {
                    let parsedUrl = urlParse(`${ url }/${ file }`);
                    parsedUrl.pathname = normalize(parsedUrl.pathname);
                    return urlFormat(parsedUrl);
                });

                return this.syncUrls(urls, callback);

            }
            else {
                return callback(new Error('ERROR_UNKNOWN'));
            }

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

            const [err, res, body] = yield progressedRequest(url, cb.expect(3));

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
