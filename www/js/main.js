const wallet = require('./wallet')
const bigInt = require('./bigint');
const hash = require('./hash')
const pt = require('./ecc-point')
const txhandler = require('./txhandler')

const contract = "0xa7913FC3E4Dbf3d8cACa06e1c2da85ED838e150f"
const w1 = new wallet("Alice");
const w2 = new wallet("Bob");
const w3 = new wallet("Eve");
const handler = new txhandler(w2)
const bobkey = handler.getPublicKey()
const evekey = w3.generateKey()
const tx1 = w1.createTransaction(bobkey, 12)
const tx2 = w1.createTransaction(bobkey, 15)
const tx3 = w1.createTransaction(evekey, 25)
const tx4 = w1.createTransaction(bobkey, 33)
console.log("=== MINT ===")
console.log(w1.formatArguments(tx1.))
console.log("=== MINT ===")
console.log("=== MINT ===")
console.log("=== MINT ===")
handler.addtxs([tx1, tx2, tx3, tx4])
console.log(w2.collectAmount(22))
tx = handler.sendMoney(evekey, 22)
for(let i = 0; i < tx.rangeProofs.length; i++) {
  console.log("==== RANGEPROOF " + i + " ====")
  console.log(w2.formatRangeProof(tx.rangeProofs[i]))
}
for(let i = 0; i < tx.ringProofs.length; i++) {
  console.log("==== RINGPROOF " + i + " ====")
  console.log(w2.formatRingProof(tx.ringProofs[i]))
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
