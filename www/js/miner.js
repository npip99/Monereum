const wallet = require('./wallet')
const hash = require('./hash')

const zip = (arr, ...arrs) => {
  return arr.map((val, i) => arrs.reduce((a, arr) => [...a, arr[i]], [val]));
}

class Miner {
  constructor(wallet) {
    this.wallet = wallet
  }
  formatTx(tx) {
    const minerPub = this.wallet.generateKey()
    const minerTx = this.wallet.createTransaction(minerPub, tx.minerFee, true)
    const minerDest = minerTx.dest
    
    const outputDests = tx.outputs.map(a => a.dest)
    const outputSrcs = tx.outputs.map(a => a.src)
    const outputCommitments = tx.outputs.map(a => a.commitment)
    const outputAmounts = tx.outputs.map(a => a.commitmentAmount)
    const outputHash = hash(outputDests, outputSrcs, outputCommitments, outputAmounts, tx.minerFee)
    const ringProofs = []
    const ringHashes = []
    for (let i = 0; i < tx.ringProofs.length; i++) {
      const txRingProof = tx.ringProofs[i]
      const ringProof = [txRingProof.funds.map(f => f.dest), txRingProof.keyImage, txRingProof.commitment, txRingProof.borromean, txRingProof.imageFundProofs, txRingProof.commitmentProofs, outputHash]
      ringProof[0].static = true
      const ringHash = hash(...ringProof)
      ringProofs.push(ringProof)
      ringHashes.push(ringHash)
    }
    const outputIDs = []
    for (let i = 0; i < outputDests.length; i++) {
      outputIDs.push(hash(outputDests[i]))
    }
    outputIDs.push(hash(minerDest))
    const ringGroupHash = hash(outputIDs, ringHashes)
    const rangeProofs = []
    const rangeHashes = []
    for (let i = 0; i < tx.rangeProofs.length; i++) {
      const rxRangeProof = tx.rangeProofs[i]
      let rangeProof = [outputIDs, rxRangeProof.commitment, rxRangeProof.rangeCommitments, rxRangeProof.rangeBorromeans, rxRangeProof.rangeProofs, rxRangeProof.indices]
      rangeProof[4].forEach(a => a.static = true)
      //console.log("RP: ", rangeProof)
      //console.log("RANGEFORMAT: ", hash.format(ringGroupHash, ...rangeProof))
      //console.log("RANGEPROOF: ", [ringGroupHash, ...rangeProof])
      const rangeHash = hash(ringGroupHash, ...rangeProof)
      rangeProof = [ringHashes, ...rangeProof]
      rangeProofs.push(rangeProof)
      rangeHashes.push(rangeHash)
    }
    const zippedRingProofs = zip(...ringProofs.map(ringProof => ringProof.slice(0, ringProof.length - 1)))
    const zippedOutputs = [outputDests, outputSrcs, outputCommitments, outputAmounts]
    console.log("ZIPPEDRINGPROOF: ", zippedRingProofs)
    console.log("RANGEHASHES: ", rangeHashes.map(a => a.toString()))
    console.log("RINGHASHES: ", ringHashes.map(a => a.toString()))
    console.log("RINGGROUPHASH: ", ringGroupHash.toString())
    console.log("OUTPUTIDS: ", outputIDs.map(a => a.toString()))
    const submit = [...zippedRingProofs, rangeHashes, ...zippedOutputs, tx.minerFee, minerDest]
    return {
      submit,
      rangeProofs,
    }
  }
}

module.exports = Miner
