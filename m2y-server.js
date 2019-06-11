// Load the TCP Library
var net = require('net');
const NodeRSA = require('node-rsa');
var fs = require('fs');
var crypto = require("crypto");
const crc = require('crc');
const rsaWrapper = require('./components_server/rsa-wrapper');
const _cliProgress = require('cli-progress');
const psBar = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);

let FILE_CRC = 0;
var SERVER_STATUS = 0;
var FILE_INDEX = 0;
var FILE_KEY = "random1234";
var BUF_SIZE = 0;
var BLOCK_SIZE = 4096;
var TMP_BUFFER = Buffer.alloc(BLOCK_SIZE);
var TMP_SIZE = 0;
var FILE_SIZE = 0;
var FILE_NAME;

function initGlobal(){
  SERVER_STATUS = 0;
  FILE_INDEX = 0;
  BUF_SIZE = 0;
  TMP_SIZE = 0;
  FILE_INDEX = 0;
  FILE_NAME = "";
  FILE_CRC = 0;
  console.log("################################################");
}

function decrypt(buffer){
  // if(buffer.length != 4096) SERVER_STATUS = 3;
  FILE_CRC += crc.crc32(buffer, 'hex');
  FILE_CRC = FILE_CRC % 0xFFFFFFFFFFFFFFFF;

  BUF_SIZE += buffer.length;
  var decipher = crypto.createDecipher('aes-128-ctr',FILE_KEY)
  var dec = Buffer.concat([decipher.update(buffer) , decipher.final()]);
  fs.appendFileSync(FILE_NAME, dec);
  return dec;
}

fs.writeFileSync("./log/server.log", "", function(err) { });
function writeLog(logStr){
    fs.appendFileSync("./log/server.log", logStr);
}

// Keep track of the chat clients
function receiveFromClient(data){  
  // console.log("received : ", data);
  // writeLog(FILE_INDEX + ":" + data.toString());

  if(data.length == BLOCK_SIZE && TMP_SIZE == 0){
    decrypt(data);
    return;
  }

  if(data.length > BLOCK_SIZE){
    var bCnt = Math.floor(data.length / BLOCK_SIZE);
    var rest = data.length % BLOCK_SIZE;
    var i = 0;
    for(i;i < bCnt ; i ++){
      var buf = Buffer.alloc(BLOCK_SIZE);
      data.copy(buf, 0, BLOCK_SIZE * i, (i + 1) * BLOCK_SIZE);
      decrypt(buf);
    }
    if(rest != 0){
      if(TMP_SIZE + rest >= BLOCK_SIZE){
        data.copy(TMP_BUFFER, TMP_SIZE, BLOCK_SIZE * i, BLOCK_SIZE * i + BLOCK_SIZE - TMP_SIZE);
        decrypt(TMP_BUFFER);
        TMP_SIZE = TMP_SIZE + rest - BLOCK_SIZE;
        data.copy(TMP_BUFFER, 0, BLOCK_SIZE * i + BLOCK_SIZE - TMP_SIZE, data.length);
      } else{
        data.copy(TMP_BUFFER, TMP_SIZE, BLOCK_SIZE * i, data.length);
        TMP_SIZE += rest;
      }
    }
    return 0;
  }

  if(data.length < BLOCK_SIZE){
    if(BUF_SIZE + TMP_SIZE >= FILE_SIZE){
      var buf = Buffer.alloc(TMP_SIZE);
      TMP_BUFFER.copy(buf, 0, 0, TMP_SIZE);
      decrypt(buf);
      console.log("\n-----------------File Receive End----------------\n");
      console.log("Received data size : " + BUF_SIZE);
      console.log("CRC : " , data.toString());
      console.log("mine : ", FILE_CRC);
      if(data.toString() == FILE_CRC.toString()){
        console.log("----------- File CRC Match Success !!! -----------\n");
        return 1;
      } else {
        console.log("----------- File CRC Match Failed -----------\n");
        return -1;
      }
    }
    if(TMP_SIZE + data.length >= BLOCK_SIZE){
      data.copy(TMP_BUFFER, TMP_SIZE, 0, BLOCK_SIZE - TMP_SIZE);
      decrypt(TMP_BUFFER);
      TMP_SIZE = TMP_SIZE + data.length - BLOCK_SIZE;
      data.copy(TMP_BUFFER, 0, data.length - TMP_SIZE, data.length);
    }else{
      data.copy(TMP_BUFFER, TMP_SIZE, 0, data.length);
      TMP_SIZE += data.length;
    }
    return 0;
  }
}

// Start a TCP Server

net.createServer(function (socket) {

  socket.name = socket.remoteAddress + ":" + socket.remotePort;
  socket.on('data', function (data) {
    switch(SERVER_STATUS)
    {
      case 0:
        const dec = rsaWrapper.decryptU(data.toString('utf-8'), './m2you/roland-frei/privateKey/roland-frei.data');
        console.log("---------received from client---------");
        // checkSecurity.initLoadServerKeys("test");
        var jsonDec = JSON.parse(dec);
        
        var retMetaData = rsaWrapper.checkMetaData(jsonDec);
        if(retMetaData == null){
          console.log("\n Check meta data failed!");
          return;
        }

        FILE_SIZE = jsonDec.filesize;
        // FILE_NAME = jsonDec.to;
        FILE_NAME = './m2you/'+jsonDec.to+'/'+jsonDec.folder+'/'+jsonDec.filename;
        fs.writeFileSync(FILE_NAME, "", function(err) { });

        const enc = rsaWrapper.encryptU(retMetaData, './m2you/' + jsonDec.from + '/pubKey/' + jsonDec.from + '.data');
        console.log("\n ------ send meta data to client : --------\n\n", enc);
        console.log("file_size", FILE_SIZE);
        if(FILE_SIZE > BLOCK_SIZE)
          SERVER_STATUS = 1;
        else
          SERVER_STATUS = 2;
        socket.write(enc);
        // psBar.start(FILE_SIZE/BLOCK_SIZE, 0);
        break;
      case 1:
        var ret = receiveFromClient(Buffer.from(data));
        if (!ret){
          FILE_INDEX ++;
          // psBar.update(FILE_INDEX);
          // socket.write("1");
          break;
        }
        if(ret == 1){
          // psBar.stop();
          console.log("----- Send ACK --------\n");
          socket.write("ACK");
          SERVER_STATUS = 2;
        } else{
          socket.write("ERROR");
        }
        initGlobal();
        break;
      case 2:
        break;
        // console.log("small data receive");
        var tmpData = Buffer.from(data);
        if(FILE_INDEX == 0){
          decrypt(tmpData);
          FILE_INDEX ++;
          // socket.write("1");
          break;
        }
        psBar.update(FILE_SIZE/BLOCK_SIZE);
        psBar.stop();
        if(tmpData.toString() == FILE_CRC.toString()){
          console.log("----------- File CRC Match Success !!! -----------\n");
          socket.write("ACK");
        } else {
          console.log("----------- File CRC Match Failed -----------\n");
          socket.write("ERROR");
        }
        initGlobal();
        break;
      default:
        break;
    }

  });

}).listen(5000);

// Put a friendly message on the terminal of the server.
console.log("\n\n--------------- Node server running at port 5000 ------------------ \n");