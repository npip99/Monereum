const bigInt = require('big-integer')
const pt = require('./ecc-point')
const constants = require('./constants')
const aes = require('aes-js')

const makeStatic = inp => {
  inp.static = true;
  return inp
}

class Parser {
  static parseJSONBigInt(num) {
    if (num.length > 256) {
      throw "Number too large";
    }
    const ret = bigInt(num);
    if (ret.lt(0)) {
      throw "Negative value found";
    }
    return ret
  }

  static parseJSONKey(key) {
    return {
      spendPub: Parser.parseJSONPt(key.spendPub),
      viewPub: Parser.parseJSONPt(key.viewPub),
    };
  }

  static parseJSONPt(p) {
    const parseBigInt = Parser.parseJSONBigInt
    return pt(parseBigInt(p.x), parseBigInt(p.y))
  }

  static parseJSONTx(tx) {
    const parsePt = Parser.parseJSONPt
    return {
      id: tx.id && bigInt(tx.id),
      src: parsePt(tx.src),
      dest: parsePt(tx.dest),
      commitment: parsePt(tx.commitment),
      commitmentAmount: bigInt(tx.commitmentAmount),
    }
  }

  static parseJSONFullTx(tx) {
    const parsePt = Parser.parseJSONPt
    const parseTx = Parser.parseJSONTx
    const parseBigInt = Parser.parseJSONBigInt
    tx.rangeProofs = tx.rangeProofs.map(rp => {
      return {
        commitment: parsePt(rp.commitment),
        rangeCommitments: rp.rangeCommitments.map(parsePt),
        rangeBorromeans: rp.rangeBorromeans.map(parseBigInt),
        rangeProofs: rp.rangeProofs.map(pf => [parseBigInt(pf[0]), parseBigInt(pf[1])]).map(makeStatic),
        indices: rp.indices.map(parseBigInt),
      }
    })
    tx.ringProofs = tx.ringProofs.map(rp => {
      return {
        funds: makeStatic(rp.funds.map(parseTx)),
        keyImage: parsePt(rp.keyImage),
        commitment: parsePt(rp.commitment),
        borromean: bigInt(rp.borromean),
        imageFundProofs: makeStatic(rp.imageFundProofs.map(parseBigInt)),
        commitmentProofs: makeStatic(rp.commitmentProofs.map(parseBigInt)),
        outputHash: bigInt(rp.outputHash),
      }
    })
    tx.outputs = tx.outputs.map(parseTx)
    tx.minerFee = bigInt(tx.minerFee)
    return tx
  }

  static parsePt(parser) {
    const x = Parser.parseNum(parser)
    const y = Parser.parseNum(parser)
    return pt(x, y)
  }

  static parseNum(parser) {
    const hex = Parser.parseHex(parser, 32)
    return bigInt(hex, 16)
  }

  static parseHex(parser, numBytes) {
    const hex = parser.data.slice(parser.pos, parser.pos += numBytes * 2)
    return hex
  }

  static parseCommittedRingGroup(parser) {
    const c = {
      ringGroupHash: Parser.parseNum(parser),
    }
    return c
  }

  static parseTransaction(parser) {
    const outputID = Parser.parseNum(parser)
    const outputSrc = Parser.parsePt(parser)
    const outputDest = Parser.parsePt(parser)
    const outputCommitment = Parser.parsePt(parser)
    const outputCommitmentAmount = Parser.parseNum(parser)
    const tx = {
      id: outputID,
      src: outputSrc,
      dest: outputDest,
      commitment: outputCommitment,
      commitmentAmount: outputCommitmentAmount
    }
    return tx
  }

  static parseMintTransaction(parser) {
    const txHash = Parser.parseNum(parser)
    return txHash
  }

  static parseRingProof(parser) {
    const ringHash = Parser.parseNum(parser)
    const funds = makeStatic([])
    for (let i = 0; i < constants.mixin; i++) {
      funds.push(Parser.parsePt(parser))
    }
    const keyImage = Parser.parsePt(parser)
    const commitment = Parser.parsePt(parser)
    const borromean = Parser.parseNum(parser)
    const imageFundProofs = makeStatic([])
    for (let i = 0; i < constants.mixin; i++) {
      imageFundProofs.push(Parser.parseNum(parser))
    }
    const commitmentProofs = makeStatic([])
    for (let i = 0; i < constants.mixin; i++) {
      commitmentProofs.push(Parser.parseNum(parser))
    }
    const outputHash = Parser.parseNum(parser)
    const rp = {
      ringHash,
      funds,
      keyImage,
      commitment,
      borromean,
      imageFundProofs,
      commitmentProofs,
      outputHash
    }
    return rp
  }

  static parseRingGroup(parser) {
    const ringGroupHash = Parser.parseNum(parser)
    // Skip over dynamic argument locations
    Parser.parseNum(parser)
    Parser.parseNum(parser)
    Parser.parseNum(parser)
    Parser.parseNum(parser)

    const numOutputs = Parser.parseNum(parser)
    const outputIDs = []
    for (let i = 0; i < numOutputs; i++) {
      outputIDs.push(Parser.parseNum(parser))
    }
    const numRings = Parser.parseNum(parser)
    const ringHashes = []
    for (let i = 0; i < numRings; i++) {
      ringHashes.push(Parser.parseNum(parser))
    }
    const numRanges = Parser.parseNum(parser)
    const rangeHashes = []
    for (let i = 0; i < numRanges; i++) {
      rangeHashes.push(Parser.parseNum(parser))
    }
    const numBytes = Parser.parseNum(parser)
    const msgData = Parser.parseHex(parser, numBytes.toJSNumber())
    const rg = {
      ringGroupHash,
      outputIDs,
      ringHashes,
      rangeHashes,
      msgData,
    }
    return rg
  }

  static parseRangeProof(parser) {
    const ringGroupHash = Parser.parseNum(parser)
    const commitment = Parser.parsePt(parser)
    // Skip over dynamic argument locations
    Parser.parseNum(parser)
    Parser.parseNum(parser)
    Parser.parseNum(parser)
    Parser.parseNum(parser)

    const numBits = Parser.parseNum(parser)
    const rangeCommitments = []
    for (let i = 0; i < numBits; i++) {
      rangeCommitments.push(Parser.parsePt(parser))
    }
    Parser.parseNum(parser)
    const rangeBorromeans = []
    for (let i = 0; i < numBits; i++) {
      rangeBorromeans.push(Parser.parseNum(parser))
    }
    Parser.parseNum(parser)
    const rangeProofs = []
    for (let i = 0; i < numBits; i++) {
      const rangeProof = makeStatic([])
      rangeProof.push(Parser.parseNum(parser))
      rangeProof.push(Parser.parseNum(parser))
      rangeProofs.push(rangeProof)
    }
    Parser.parseNum(parser)
    const indices = []
    for (let i = 0; i < numBits; i++) {
      indices.push(Parser.parseNum(parser))
    }
    return {
      ringGroupHash,
			commitment,
			rangeCommitments,
			rangeBorromeans,
			rangeProofs,
			indices
		}
  }

  static parseRingGroupRejected(parser) {
    const ringGroupHash = Parser.parseNum(parser)
    return {
      ringGroupHash,
    }
  }

  static initParser(data) {
    const parser = {
      data: data.slice(2),
      pos: 0
    }
    return parser
  }
}

module.exports = Parser
