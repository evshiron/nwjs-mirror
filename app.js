
const express = require('express');
const serveStatic = require('serve-static');

const config = require('./mirror.config');

const Synchronizer = require('./lib/synchronizer');

const app = express();
const synchronizer = new Synchronizer(config);

app.use('/public', serveStatic('./public/'));
app.listen(config.port);

synchronizer.start();
synchronizer.syncAll((err, results) => {
    console.error(err);
    console.log(results);
});
