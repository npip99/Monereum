const hash = require('./hash')

const mixin = 3

module.exports = {
  // Ropsten
  // initializer: 0x643d1ff3baf8732a0d247d5c0df6e0e5c091e1f4
  verifier: '0x94e721fdc59373277cdbe1c6a69e9c09b3357846',
  blockchain: '0x69a60b28074150febef4097203445b6d445e532c',
  ringGroupTopic: '0x' + hash.funcHash("LogRingGroup(uint256,uint256[],uint256[],bytes)"),
  ringProofTopic: '0x' + hash.funcHash("LogRingProof(uint256,uint256[2][MIXIN],uint256[2],uint256[2],uint256,uint256[MIXIN],uint256[MIXIN],uint256)".replace(/MIXIN/g, "" + mixin)),
  rangeProofTopic: '0x' + hash.funcHash("LogRangeProof(uint256,uint256[2],uint256[2][],uint256[],uint256[2][],uint256[])"),
  transactionTopic: '0x' + hash.funcHash("LogTransaction(uint256,uint256[2],uint256[2],uint256[2],uint256)"),
  committedRingGroupTopic: '0x' + hash.funcHash("LogRingGroupCommitted(uint256)"),
  mintTransactionTopic: '0x' + hash.funcHash("LogMintTransaction(uint256)"),
  mixin: mixin,
  disputeTime: 2*60,
}
