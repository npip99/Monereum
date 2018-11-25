const wallet = require('./wallet')
const bigInt = require('./bigint');
const hash = require('./hash')
const pt = require('./ecc-point')
const txhandler = require('./txhandler')
const miner = require('./miner')
const parser = require('./parser')

window.addEventListener('load', async () => {
    // Modern dapp browsers...
    if (window.ethereum) {
        window.web3 = new Web3(ethereum);
        try {
            // Request account access if needed
            await ethereum.enable();
            // Acccounts now exposed
            // web3.eth.sendTransaction({/* ... */});
        } catch (error) {
            // User denied account access...
        }
    }
    // Legacy dapp browsers...
    else if (window.web3) {
        window.web3 = new Web3(web3.currentProvider);
        // Acccounts always exposed
        web3.eth.sendTransaction({/* ... */});
    }
    // Non-dapp browsers...
    else {
        console.log('Non-Ethereum browser detected. You should consider trying MetaMask!');
    }
    
    pubhash = hash
    salt = bigInt.randBetween(0, bigInt[2].pow(256)).toString()
    const w1 = new wallet("Alice" + salt);
    const w2 = new wallet("Bob" + salt);
    const w3 = new wallet("Eve" + salt);
    const handler = new txhandler(w2, window.web3)
    const m = new miner(new wallet("miner" + salt), window.web3)
    const bobkey = handler.getPublicKey()
    const evekey = w3.generateKey()
    const tx1 = w1.createTransaction(bobkey, 20000, true)
    const tx2 = w1.createTransaction(bobkey, 10000, true)
    const tx3 = w1.createTransaction(evekey, 25, true)
    const tx4 = w1.createTransaction(evekey, 26, true)
    ;[tx1, tx2, tx3, tx4].map(tx => {
      console.log("=== MINT ===")
      console.log(wallet.formatArguments(tx.src, tx.dest, tx.commitmentAmount))
      //handler.addtx(tx)
      m.mint(tx)
    });
    submitit = () => {
      console.log(handler.txs)
      const fullTx = handler.sendMoney(evekey, 25000)
      for(let i = 0; i < fullTx.rangeProofs.length; i++) {
        console.log("==== RANGEPROOF " + i + " ====")
        console.log(w2.formatRangeProof(fullTx.rangeProofs[i]))
      }
      for(let i = 0; i < fullTx.ringProofs.length; i++) {
        console.log("==== RINGPROOF " + i + " ====")
        console.log(w2.formatRingProof(fullTx.ringProofs[i]))
      }
      //console.log("=== SUBMIT ===\n", wallet.formatArguments(...m.formatTx(fullTx).submit));
      m.submit(fullTx)
    }
    
    //handler.addtxs([tx1, tx2, tx3, tx4, tx5, tx6, tx7])
    //console.log(w2.collectAmount(25000))
    //tx = handler.sendMoney(evekey, 25000)
    /*for(let i = 0; i < tx.rangeProofs.length; i++) {
      console.log("==== RANGEPROOF " + i + " ====")
      console.log(w2.formatRangeProof(tx.rangeProofs[i]))
    }
    for(let i = 0; i < tx.ringProofs.length; i++) {
      console.log("==== RINGPROOF " + i + " ====")
      console.log(w2.formatRingProof(tx.ringProofs[i]))
    }
    console.log("Full tx", tx)*/
    /*m = new miner(new wallet("minerboy" + salt))
    console.log("OUTPUT TX: ", tx)
    handler.addtxs(tx.outputs)
    const formatTx = m.formatTx(tx)
    console.log("==== SUBMIT ====\n", wallet.formatArguments(...formatTx.submit));
    console.log(eval("[" + wallet.formatArguments(...formatTx.submit) + "]"))
    for (rangeProof of formatTx.rangeProofs) {
      console.log("==== RANGEPROOF ====\n", wallet.formatArguments(...rangeProof))
      console.log(eval("[" + wallet.formatArguments(...rangeProof) + "]"))
    }*/
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
    handler.sync()
});

