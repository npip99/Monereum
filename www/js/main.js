const wallet = require('./wallet')
const bigInt = require('./bigint');
const hash = require('./hash')
const pt = require('./ecc-point')

console.log(hash(1, 2))

const w = new wallet("hey");
const key = w.generatePrivateKey();
const tx = w.createTransaction(key.pubKey, 5);
const dec = w.decryptTransaction(tx, key);
console.log("Test: ", key, 5, tx, dec);
console.log("Receipt: ", w.getReceipt(tx));
console.log("H: ", pt.h.toString());
//console.log(pt.g.times(2).times(5), pt.g.times(5).times(2))
console.log(pt.g.plus(pt.g))//, pt.g.square().plus(pt.g))
console.log("B")
console.log(pt.g.times(2))
//console.log(pt.g, pt.g.times(5).times(3))
//console.log(pt.g.times(2), pt.g.times(5).times(3))
