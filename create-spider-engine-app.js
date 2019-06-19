#!/usr/bin/env node
'use strict';

const version = '1.0.0';
const program = require('commander');
const fs = require('fs');
const JSZip = require("jszip");
const request = require("request");

var directory;

program
  .version(version)
  .usage("my-app")
  .arguments('<dir>')
  .action((dir) => {
    directory = dir;
  });

program.parse(process.argv);

const exists = (dir) => new Promise((resolve, reject) => {
  fs.access(dir, fs.constants.F_OK, (err) => {    
    resolve(!Boolean(err));
  });
});

const isEmpty = (dir) => new Promise((resolve, reject) => {
  fs.readdir(directory, (err, files) => {
    if (err) {
      reject(`Cannot stat directory '${dir}'`);
      return;
    }
    resolve(files.length === 0);
  })
});

const writeFile = (path, data) => new Promise((resolve, reject) => {  
  fs.writeFile(path, data, (err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve();
  });
});

const mkDir = (dir) => new Promise((resolve, reject) => {  
  fs.mkdir(dir, { recursive: true }, err => {
    if (err) {
      reject(`Cannot create directory '${dir}'`);
    }
    resolve();
  })
});

const getFiles = () => new Promise((resolve, reject) => {
  request(
    {
      method: 'GET',
      url: "https://storage.googleapis.com/spiderengine-io.appspot.com/minimal.zip",
      encoding: null
    },
    (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }
      const newZip = new JSZip();
      newZip.loadAsync(body)
        .then(zip => Promise.all(
          Object.keys(zip.files)
            .map(path => {
              const zipFile = zip.file(path);
              if (zipFile) {
                return zipFile.async("string").then(data => [path, data]);
              } else {
                return Promise.resolve(null);
              }
            })
        ))
        .then(resolve)
        .catch(reject);
    });
});

if (!directory) {
  console.error("Directory not specified");
  program.outputHelp();
  process.exit(1);
} else {

  let directoryExists = false;
  exists(directory)
    .then(e => {
      directoryExists = e;
      if (!e) {
        return;
      }
      return isEmpty(directory)
        .then(empty => {
          if (!empty) {
            return Promise.reject(`Directory '${directory}' is not empty.`);
          }
        });
    })
    .then(() => {
      if (!directoryExists) {
        return mkDir(directory);
      }
    })
    .then(() => getFiles())
    .then(files => {

      let chain = Promise.resolve();
      for (const file of files.filter(Boolean)) {
        const [filePath, fileData] = file;
        chain = chain.then(() => new Promise((resolve, reject) => {
          const finalPath = `${directory}/${filePath}`;
          const fileDir = finalPath.split("/").slice(0, -1).join("/");
          Promise.resolve()
            .then(() => {
              if (fileDir.length) {
                return exists(fileDir)
                  .then(e => {
                    if (!e) {
                      return mkDir(fileDir);
                    }
                  });
              }
            })
          .then(() => writeFile(finalPath, fileData))
          .then(resolve)
          .catch(reject);
        }));
      }

      return chain;

    })
    .then(() => console.log(`
Spider Engine minimal project successfully created in '${directory}'.
    `))
    .catch(error => console.error(error));
}
