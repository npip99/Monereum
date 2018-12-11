const {funcHash} = require('./abi')

const mixin = 3

module.exports = {
  // Rinkeby
  // "0x643d1ff3baf8732a0d247d5c0df6e0e5c091e1f4", "0x94e721fdc59373277cdbe1c6a69e9c09b3357846"
  // initializer: 0x643d1ff3baf8732a0d247d5c0df6e0e5c091e1f4
  verifier: '0x94e721fdc59373277cdbe1c6a69e9c09b3357846',
  blockchain: '0xe0d5d2fdb6fcf3e647cb4e81497d86cc1ef80986',
  ringGroupTopic: '0x' + funcHash("LogRingGroup(uint256,uint256[],uint256[],uint256[],bytes)"),
  ringProofTopic: '0x' + funcHash("LogRingProof(uint256,uint256[2][MIXIN],uint256[2],uint256[2],uint256,uint256[MIXIN],uint256[MIXIN],uint256)".replace(/MIXIN/g, "" + mixin)),
  rangeProofTopic: '0x' + funcHash("LogRangeProof(uint256,uint256[2],uint256[2][],uint256[],uint256[2][],uint256[])"),
  transactionTopic: '0x' + funcHash("LogTransaction(uint256,uint256[2],uint256[2],uint256[2],uint256)"),
  committedRingGroupTopic: '0x' + funcHash("LogRingGroupCommitted(uint256)"),
  mintTransactionTopic: '0x' + funcHash("LogMintTransaction(uint256)"),
  ringGroupRejectedTopic: '0x' + funcHash("LogRingGroupRejected(uint256)"),
  mixin: mixin,
  disputeTime: 2*60,
}
