// Load the TCP Library
var net = require('net');
var path = require('path');
var NodeRSA = require('node-rsa');
var crypto = require("crypto");
var fs = require('fs');
var args = process.argv;
var crc = require('crc');
var sleep = require('sleep');
var _cliProgress = require('cli-progress');
var HOST = 'localhost';
var PORT = 5000;
var client = new net.Socket();
var rsaWrapper = require('./components/rsa-wrapper');
var psBar = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);

var CLIENT_STATUS = 0;
var FILE_KEY;
var BLOCK_SIZE = 4096;
var INDEX = 0;
var FILE_BUF;
let FILE_CRC = 0;
var data_size = 0;
var JsonMeta;

var glength = 0;

function encryptRSA(toEncrypt, relativeOrAbsolutePathToPublicKey) {
    const absolutePath = path.resolve(relativeOrAbsolutePathToPublicKey)
    const publicKey = fs.readFileSync(absolutePath, 'utf8')
    const key = new NodeRSA();
    key.importKey(publicKey, 'pkcs8-public');
    return key.encrypt(toEncrypt, 'base64', 'utf8');
}

function decryptRSA(toDecrypt, relativeOrAbsolutePathtoPrivateKey) {
    const absolutePath = path.resolve(relativeOrAbsolutePathtoPrivateKey);
    const privateKey = fs.readFileSync(absolutePath, 'utf8');
    const key = new NodeRSA();
    key.importKey(privateKey, 'pkcs8-private');
    return key.decrypt(toDecrypt, 'utf8');
}

function checkFileExist(filePath){
    if (!fs.existsSync(filePath)) {
        console.log("Can't find", filePath);
        client.destroy();
        return null;
    }
    return filePath;
}

function sendMetaData() {
    var path = checkFileExist('./m2you/zhenqiang/photo/' + args[2]);
    if (!path)
        return;
    var meta_info = fs.readFileSync(path, "utf8");
    JsonMeta = JSON.parse(meta_info);

    path = checkFileExist('./m2you/'+JsonMeta.from+'/'+JsonMeta.folder+'/'+JsonMeta.filename);
    if (!path)
        return;
    JsonMeta.filesize = fs.statSync(path).size;;
    var checkSum = crc.crc32(Buffer.from(JSON.stringify(JsonMeta), 'utf8'));
    JsonMeta.metaCRC = checkSum;
    console.log("send crc : ", checkSum);
    const enc = rsaWrapper.encryptU(JSON.stringify(JsonMeta), './m2you/'+JsonMeta.from+'/pubKey/'+JsonMeta.to+'.data');
    console.log("Sent encrypted txt : \n", enc);  
    client.write(enc);
}

function encrypt(buffer){
  var cipher = crypto.createCipher('aes-128-ctr',FILE_KEY);
  var crypted = Buffer.concat([cipher.update(buffer),cipher.final()]);
  FILE_CRC += crc.crc32(crypted, 'hex');
  FILE_CRC = FILE_CRC % 0xFFFFFFFFFFFFFFFF;
  return crypted;
}
fs.writeFileSync("./log/client.log", "", function(err) { });
function writeLog(logStr){
    fs.appendFileSync("./log/client.log", logStr);
}

function sendFileToServerByStream(){

   let path = './m2you/'+JsonMeta.from+'/'+JsonMeta.folder+'/'+JsonMeta.filename;
   let readStream = fs.createReadStream(path, {flags: 'r', highWaterMark: BLOCK_SIZE });
   // let chunks = [];
   // psBar.start(JsonMeta.filesize/BLOCK_SIZE, 0);
    // Handle any errors while reading
    readStream.on('error', err => {
        return cb(err);
    });

    // Listen for data
    readStream.on('data', chunk => {
        glength += chunk.length;        
        var encBuf = encrypt(chunk);
        
        // writeLog(INDEX++ + ":" + encBuf.toString());

        client.write(encBuf);
        sleep.usleep(10);
        // psBar.update(INDEX++);
        // console.log("send Buf : ", encBuf);
        data_size += BLOCK_SIZE;

    });

    // File is done being read
    readStream.on('close', () => {
        // Create a buffer of the image from the stream
        console.log("\n------- Sent File Total Length -----------\n", glength);
        CLIENT_STATUS = 2;
        client.write(FILE_CRC.toString());
        // return cb(null, Buffer.concat(chunks));
    });
}

function sendFileToServer(){
    if(INDEX == 0)
    {
        console.log("file length : ", FILE_BUF.length);
        if(FILE_BUF.length > BLOCK_SIZE){
            var tmpBuf = Buffer.alloc(BLOCK_SIZE);
            FILE_BUF.copy(tmpBuf, 0, INDEX * BLOCK_SIZE, (INDEX + 1) * BLOCK_SIZE)
            var encBuf = encrypt(tmpBuf);
            client.write(encBuf);
            data_size += BLOCK_SIZE;
        } else{
            var encBuf = encrypt(FILE_BUF);
            client.write(encBuf);    
            CLIENT_STATUS = 3;
            console.log("small size : ", FILE_BUF.length);

        }
        return;
    }
    var tmpBuf = Buffer.alloc(BLOCK_SIZE);
    FILE_BUF.copy(tmpBuf, 0, INDEX * BLOCK_SIZE, (INDEX + 1) * BLOCK_SIZE)
    var encBuf = encrypt(tmpBuf);
    client.write(encBuf);
}


client.connect(PORT, HOST, function () {
    console.log("----------start connect to server-----------");
    sendMetaData();

    client.on('data', function (data) {
        switch(CLIENT_STATUS){
            case 0:
                console.log(' \n------ Server Response: ---\n\n', data.toString('utf-8'));
                var dec_tst = rsaWrapper.decryptU(data.toString('utf-8'), './m2you/zhenqiang/privateKey/zhenqiang.data'); 
                console.log("\n---- decripted txt from server --- \n", dec_tst);
                FILE_KEY = rsaWrapper.checkMetaData(JSON.parse(dec_tst));
                if(FILE_KEY == null){
                    console.log("\ncrc check failed!");
                    return;
                }
                console.log("\n---- crc check success! ---- \n");
                console.log("\n------- start send file ---------\n");
                console.log("file key : ", FILE_KEY);               
                // sendFileToServer();
                sendFileToServerByStream();
                // CLIENT_STATUS = 1;
                // psBar.start(FILE_BUF.length/BLOCK_SIZE, 0); 
                break;
            case 1:
                INDEX ++;                
                psBar.update(INDEX);
                // console.log(INDEX + " : " + data_size);
                // console.log("\n", data.toString("utf8"));
                if(INDEX < Math.floor(FILE_BUF.length/BLOCK_SIZE)){
                    sendFileToServer();
                    data_size += BLOCK_SIZE;
                    return;
                }//16933

                // console.log("count ; ", Math.ceil(FILE_BUF.length/BLOCK_SIZE));
                if(INDEX == Math.floor(FILE_BUF.length/BLOCK_SIZE)){
                    var tmpBuf = Buffer.alloc(FILE_BUF.length - INDEX * BLOCK_SIZE);
                    // console.log("rest size", FILE_BUF.length - (INDEX-1) * BLOCK_SIZE);
                    FILE_BUF.copy(tmpBuf, 0, INDEX * BLOCK_SIZE, FILE_BUF.length);
                    var encBuf = encrypt(tmpBuf);
                    data_size+= encBuf.length;
                    console.log("rest size : ", encBuf.length);
                    client.write(encBuf);
                    return;
                }
                if(INDEX == Math.floor(FILE_BUF.length/BLOCK_SIZE) + 1){
                    console.log("\n--------- File CRC Send-------\n");
                    console.log("filecrc : ", FILE_CRC);
                    client.write(FILE_CRC.toString());
                    CLIENT_STATUS = 2;
                    return;
                }
                break;
            case 2:
                var oldpath = './m2you/' + JsonMeta.from + '/'+ JsonMeta.folder + '/';
                var fname = args[2].split(".")[0];
            
                if(data.toString() == "ACK"){
                    // psBar.stop();
                    console.log("\n------ ACK Received ---------\n");
                    console.log(oldpath + "==>" + oldpath + fname + ".done");
                    // fs.renameSync(oldpath + args[2] , oldpath + fname + ".done");
                    client.destroy();
                    return;
                }
                console.log("Transfer failed !!");
                // fs.renameSync(oldpath + args[2] , oldpath + fname + ".failed");
                client.destroy();
                break;
            case 3:
                console.log("from server");
                client.write(FILE_CRC.toString());
                psBar.update(FILE_BUF.length/BLOCK_SIZE);
                CLIENT_STATUS = 2;
                break;
            default:
                break;
        }
    });

    client.on('close', function () {
        // console.log('Connection closed');
    });
});