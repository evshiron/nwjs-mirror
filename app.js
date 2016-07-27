
const { writeFile } = require('fs');

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

    if(err) {
        console.error(err);
        return;
    }

    writeFile('./results.json', JSON.stringify(results, 0, 4), (err) => {

        if(err) {
            console.error(err);
            return;
        }

        console.log(results);

    });

});
