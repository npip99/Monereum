const wallet = require('./wallet')
const bigInt = require('./bigint');
const hash = require('./hash')
const pt = require('./ecc-point')

const w1 = new wallet("hey");
const w2 = new wallet("yo");
const key1 = w2.generatePrivateKey()
const key2 = w2.generatePrivateKey()
const key3 = w2.generatePrivateKey()
const outKey1 = w2.generatePrivateKey()
const tx1 = w1.createTransaction(key1.pubKey, 30)
const tx2 = w1.createTransaction(key2.pubKey, 4)
const tx3 = w1.createTransaction(key3.pubKey, 5)
const out1 = w2.createTransaction(outKey1.pubKey, 30)
const dec1 = w2.decryptTransaction(tx1, key1)
const ringProof = w2.createRingProof(dec1, [tx2, tx3], out1)
//console.log(pt.hashSet.map(a => a.toString()).join(","))
//console.log("hashG", hash(pt.g).toString())
//console.log("hashG", pt.g.hashInP().toString())
//console.log(pt.h.toString())
//console.log(pt.h.isOnCurve())
//console.log(hash(pt.h).toString(), pt.p.toString())
//console.log(pt.hashSet[100].toString())
console.log("RingProof: ", ringProof)
console.log("Verification: ", wallet.verifyRingProof(ringProof))
console.log("Formatted RingProof: ", wallet.formatRingProof(ringProof))
console.log("RangeProof: ", wallet.createRangeProof(out1))
//console.log(JSON.stringify(tx))
//console.log(JSON.stringify(tx))
//console.log(JSON.stringify({"hey" : new pt(1, 2)}))
