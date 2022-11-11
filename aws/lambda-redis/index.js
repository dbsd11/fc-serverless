'use strict';

const Helpers = require('./helpers');

exports.handler = function(e, ctx, cb) {
  console.info("call redis event:", e)
  var body = JSON.parse(e.body);
  if(body.create) {
    Helpers.create(body.key, body.data).then((r) => {
      console.log(r)
      cb(null, { result: r })
    }).catch((e) => console.log(e));
  } else if(body.get) {
    Helpers.findOne(body.key).then((r) => {
      console.log(r)
      cb(null, { result: r })
    }).catch((e) => console.log(e));
  } else if(body.update) {
    Helpers.update(body.key, body.data).then((r) => {
      console.log(r)
      cb(null, { result: r })
    }).catch((e) => console.log(e));
  } else if(body.remove) {
    Helpers.remove(body.key).then((r) => {
      console.log(r)
      cb(null, { result: r })
    }).catch((e) => console.log(e));
  } else {
    return cb(null, { msg: 'no match redis action' });
  }
};
