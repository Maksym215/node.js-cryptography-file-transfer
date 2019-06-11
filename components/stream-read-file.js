const fs = require('fs')
const path = require('path')
const streamReadLib = {};

streamReadLib.bootstrap = (outputFile) => {
    // fs.exists is deprecated
    // check if output file exists
    // https://nodejs.org/api/fs.html#fs_fs_exists_path_callback
    fs.exists(outputFile, (exists) => {
        if (exists) {
            // output file exists, delete it
            // https://nodejs.org/api/fs.html#fs_fs_unlink_path_callback
            fs.unlink(outputFile, (err) => {
                if (err) {
                    throw err
                }

                console.info('deleted succesfully');
                checkInputFile();
            })
        } else {
            // output file doesn't exist, move on
            checkInputFile();
        }
    })
}

streamReadLib.checkInputFile = (inputFile) =>{
    // check if input file can be read
    // https://nodejs.org/api/fs.html#fs_fs_access_path_mode_callback
    fs.access(inputFile, fs.constants.R_OK, (err) => {
        if (err) {
            // file can't be read, throw error
            throw err;
        }

        // file can be read, move on
        loadInputFile();
    })
}

streamReadLib.saveToOutput = (outputFile) => {
    // create write stream
    // https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options
    const stream = fs.createWriteStream(outputFile, {
        flags: 'w'
    })

    // return wrapper function which simply writes data into the stream
    return (data) => {
        // check if the stream is writable
        if (stream.writable) {
            if (data === null) {
                stream.end();
            } else if (data instanceof Array) {
                stream.write(data.join('\n'));
            } else {
                stream.write(data);
            }
        }
    }
}

streamReadLib.parseLine = (line, respond) => {
    respond([line]);
}

streamReadLib.loadInputFile = (inputFile) => {
    // create write stream
    const saveOutput = saveToOutput();
    // create read stream
    // https://nodejs.org/api/fs.html#fs_fs_createreadstream_path_options
    const stream = fs.createReadStream(inputFile, {
        autoClose: true,
        encoding: 'utf8',
        flags: 'r'
    });

    let buffer = null;

    stream.on('data', (chunk) => {
        // append the buffer to the current chunk
        const lines = (buffer !== null)
            ? (buffer + chunk).split('\n')
            : chunk.split('\n')

        const lineLength = lines.length;
        let lineIndex = -1;

        // save last line for later (last line can be incomplete)
        buffer = lines[lineLength - 1];

        // loop trough all lines
        // but don't include the last line
        while (++lineIndex < lineLength - 1) {
            parseLine(lines[lineIndex], saveOutput);
        }
    });

    stream.on('end', () => {
        if (buffer !== null && buffer.length > 0) {
            // parse the last line
            parseLine(buffer, saveOutput);
        }

        // Passing null signals the end of the stream (EOF)
        saveOutput(null);
    })
}
// kick off the parsing process
module.exports = streamReadLib;