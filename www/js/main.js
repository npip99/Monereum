const wallet = require('./wallet')
const bigInt = require('./bigint');
const hash = require('./hash')
const pt = require('./ecc-point')
const txhandler = require('./txhandler')
const miner = require('./miner')

// Initializer: 0xa221eb60a21d88e76eff072d3bae3d49d852b610
// Verifier: 0x4e8491ea3162c700584fcd6565f4ac4a1edcc37e
// Blockchain: 0xf95091d0164bd0f8b898e9d8e5b9e32c375ea26c
pubhash = hash
salt = bigInt.randBetween(0, bigInt[2].pow(256)).toString()
const w1 = new wallet("Alice" + salt);
const w2 = new wallet("Bob" + salt);
const w3 = new wallet("Eve" + salt);
const handler = new txhandler(w2)
const bobkey = handler.getPublicKey()
const evekey = w3.generateKey()
const tx1 = w1.createTransaction(bobkey, 12, true)
const tx2 = w1.createTransaction(bobkey, 15, true)
const tx3 = w1.createTransaction(evekey, 25, true)
const tx4 = w1.createTransaction(bobkey, 33, true)
console.log("=== MINT ===")
console.log(wallet.formatArguments(tx1.src, tx1.dest, tx1.commitmentAmount))
console.log("=== MINT ===")
console.log(wallet.formatArguments(tx2.src, tx2.dest, tx2.commitmentAmount))
console.log("=== MINT ===")
console.log(wallet.formatArguments(tx3.src, tx3.dest, tx3.commitmentAmount))
console.log("=== MINT ===")
console.log(wallet.formatArguments(tx4.src, tx4.dest, tx4.commitmentAmount))
handler.addtxs([tx1, tx2, tx3, tx4])
console.log(w2.collectAmount(22))
tx = handler.sendMoney(evekey, 22)
/*for(let i = 0; i < tx.rangeProofs.length; i++) {
  console.log("==== RANGEPROOF " + i + " ====")
  console.log(w2.formatRangeProof(tx.rangeProofs[i]))
}
for(let i = 0; i < tx.ringProofs.length; i++) {
  console.log("==== RINGPROOF " + i + " ====")
  console.log(w2.formatRingProof(tx.ringProofs[i]))
}
console.log("Full tx", tx)*/
m = new miner(new wallet("minerboy" + salt))
const formatTx = m.formatTx(tx)
console.log("==== SUBMIT ====\n", wallet.formatArguments(...formatTx.submit));
console.log(eval("[" + wallet.formatArguments(...formatTx.submit) + "]"))
for (rangeProof of formatTx.rangeProofs) {
  console.log("==== RANGEPROOF ====\n", wallet.formatArguments(...rangeProof))
  console.log(eval("[" + wallet.formatArguments(...rangeProof) + "]"))
}
/*
const outKey1 = w2.generateKey()
const tx1 = w1.createTransaction(key1, testAmount)
const tx2 = w1.createTransaction(key2, 4)
const tx3 = w1.createTransaction(key3, 5)
const out1 = w2.createTransaction(outKey1, testAmount)
const dec1 = w2.decryptTransaction(tx1, key1)
const ringProof = w2.createRingProof(dec1, [tx2, tx3], out1)*/
//console.log(pt.hashSet.map(a => a.toString()).join(","))
//console.log("hashG", hash(pt.g).toString())
//console.log("hashG", pt.g.hashInP().toString())
//console.log(pt.h.toString())
//console.log(pt.h.isOnCurve())
//console.log(hash(pt.h).toString(), pt.p.toString())
//console.log(pt.hashSet[100].toString())
/*
console.log("hashSet", pt.hashSet[127].toString())
console.log("hashG", pt.g.hashInP().toString())
console.log("qG", pt.g.times(pt.q.plus(1)))
console.log("RingProof: ", ringProof)
console.log("Verification: ", w2.verifyRingProof(ringProof))
console.log("Formatted RingProof: ", w2.formatRingProof(ringProof))
const rangeProof = w2.createRangeProof(out1)
console.log("RangeProof: ", rangeProof)
console.log("Verification: ", w2.verifyRangeProof(rangeProof))
console.log("Formatted RangeProof: ", w2.formatRangeProof(rangeProof))*/
//console.log(JSON.stringify(tx))
//console.log(JSON.stringify(tx))
//console.log(JSON.stringify({"hey" : new pt(1, 2)}))
console.log()

