'use strict';

var Promise = require('bluebird');
var Redis = require('ioredis');

function getRedis() {
  var redis = new Redis({
    host: "127.0.0.1",   // Redis host
    port: "6379",   // Redis port
    db: 0
  });
  return redis;
}

exports.create = function(key, data) {
  if(!key) {
    console.log("Key not exists");
    throw "Key not exists";
  }

  console.log('Init create Key ', key, ' data ', data);
  return new Promise((resolve, reject) => {
    var redis = getRedis()
    redis.set(key, data)
      .then((result) => {
        console.log("Result from create ", result);
        resolve(result);
      })
      .catch((err) => {
        console.log("Error from create ", err);
        reject(err);
      })
      .finally(() => {
        redis.quit();
      });
  });
};

exports.findOne = function(key) {
  if(!key) {
    console.log("Key not exists");
    throw "Key not exists";
  }

  console.log('Init find Key ', key);
  return new Promise((resolve, reject) => {
    var redis = getRedis()
    redis.get(key)
      .then((result) => {
        console.log("Read ", result);
        resolve(result);
      })
      .catch((err) => {
        console.log("Error from read ", err);
        reject(err);
      })
      .finally(() => {
        redis.quit();
      });
  });
};

exports.update = function(key, data) {
  if(!key) {
    console.log("Key not exists");
    throw "Key not exists";
  }

  console.log('update Key ', key, ' data ', data);
  return new Promise((resolve, reject) => {
    var redis = getRedis()
    redis.set(key, data)
      .tap((result) => {
        console.log("Result from update ", result);
      })
      .catchThrow((err) => {
        console.log("Error from update ", err);
      })
      .finally(() => {
        redis.quit();
      });
  });
};

exports.remove = function(key) {
  if(!key) {
    console.log("Key not exists");
    throw "Key not exists";
  }

  console.log('remove Key ', key);
  return new Promise((resolve, reject) => {
    var redis = getRedis()
    redis.del(key)
      .then((result) => {
        console.log("Remove item: ", result);
        resolve(result);
      })
      .catch((err) => {
        console.log("Error from remove item ", err);
        reject(err)
      })
      .finally(() => {
        redis.quit();
      });
  })
};
