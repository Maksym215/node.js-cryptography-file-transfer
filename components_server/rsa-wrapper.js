const path = require('path');
const rsaWrapper = {};
const fs = require('fs');
const NodeRSA = require('node-rsa');
const crypto = require('crypto');
var mkdirp = require('mkdirp');
const crc = require('crc');
// const crc = require('node-crc');

rsaWrapper.generateRSAKey = () =>{
    mkdirp('./m2you', function(err) { });
    mkdirp('./m2you/zhenqiang', function(err) { });
    mkdirp('./m2you/zhenqiang/privateKey', function(err) { });
    mkdirp('./m2you/zhenqiang/pubKey', function(err) { });
    mkdirp('./m2you/roland-frei', function(err) { });
    mkdirp('./m2you/roland-frei/privateKey', function(err) { });
    mkdirp('./m2you/roland-frei/pubKey', function(err) { });
    
    var key = new NodeRSA();
    key.generateKeyPair(512);
 
    priv = key.exportKey('pkcs1-private');
    // console.log('priv : ', priv); 
    fs.writeFileSync("./m2you/roland-frei/privateKey/roland-frei.data", priv, function(err) { });

    pub = key.exportKey('pkcs1-public');
    // console.log('pub : ', pub); 

    fs.writeFileSync("./m2you/zhenqiang/pubKey/roland-frei.data", pub, function(err) { });
//  key.free;
    
    
//  key = NodeRSA({b: 512});
    key.generateKeyPair(512);
 
    priv = key.exportKey('pkcs1-private');
    // console.log('priv : ', priv); 
    fs.writeFileSync("./m2you/zhenqiang/privateKey/zhenqiang.data", priv);

    pub = key.exportKey('pkcs1-public');
    // console.log('pub : ', pub); 
    fs.writeFileSync("./m2you/zhenqiang/pubKey/eric-brian.data", pub);
}

rsaWrapper.encryptU = (toEncrypt, relativeOrAbsolutePathToPublicKey) => {
    var absolutePath = path.resolve(relativeOrAbsolutePathToPublicKey)
    var publicKey = fs.readFileSync(absolutePath, 'utf8')
    var key = new NodeRSA();
    key.importKey(publicKey, 'pkcs1-public');
    return key.encrypt(toEncrypt, 'base64', 'utf8');
};


rsaWrapper.decryptU = (toDecrypt, relativeOrAbsolutePathtoPrivateKey) => {
    var absolutePath = path.resolve(relativeOrAbsolutePathtoPrivateKey);
    var privateKey = fs.readFileSync(absolutePath, 'utf8');
    var key = new NodeRSA();
    key.importKey(privateKey, 'pkcs1-private');
    return key.decrypt(toDecrypt, 'utf8');
};

rsaWrapper.checkMetaData = (metaData) =>{
    // console.log("\n-----metadata : \n", metaData);
    var clientCRC = metaData.metaCRC;
    metaData.metaCRC = "";
    var checkSum = crc.crc32(Buffer.from(JSON.stringify(metaData), 'utf8'));
    console.log("crc compare : ", clientCRC + " : " + checkSum);
    if(checkSum != clientCRC){
        console.log("Failed in CRC check!");
        return null;
    }

    console.log("\n -------- crc check successful ------------ \n");
    metaData.filekey = "random1234";
    checkSum = crc.crc32(Buffer.from(JSON.stringify(metaData), 'utf8'));
    metaData.metaCRC = checkSum;

    fs.writeFileSync("./m2you/roland-frei/photo/zhenqiang_30-12-2018_23-59-59.meta", JSON.stringify(metaData), function(err) { });
    return JSON.stringify(metaData);
}

module.exports = rsaWrapper;