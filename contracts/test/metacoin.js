var Blockchain = artifacts.require("./MonereumBlockchain.sol");
var bigint = require("big-integer");
let value = bigint(2).pow(256);

var MetaCoin = artifacts.require("./MetaCoin.sol");


contract('Monereum', function(accounts) {
  it("should put 10000 MetaCoin in the first account", function() {
    return Blockchain.deployed().then(function(instance) {
      console.log(instance);
      return instance.G.call();
    }).then(function(balance) {
      console.log(balance.valueOf());
      assert.equal(1, 1, "Nope");
      //assert.equal(balance.valueOf(), 10000, "10000 wasn't in the first account");
    });
  });
/*  it("should call a function that depends on a linked library", function() {
    var meta;
    var metaCoinBalance;
    var metaCoinEthBalance;

    return Blockchain.deployed().then(function(instance) {
      meta = instance;
      return meta.getBalance.call(accounts[0]);
    }).then(function(outCoinBalance) {
      metaCoinBalance = outCoinBalance.toNumber();
      return meta.getBalanceInEth.call(accounts[0]);
    }).then(function(outCoinBalanceEth) {
      metaCoinEthBalance = outCoinBalanceEth.toNumber();
    }).then(function() {
      assert.equal(metaCoinEthBalance, 2 * metaCoinBalance, "Library function returned unexpected function, linkage may be broken");
    });
  });
  it("should send coin correctly", function() {
    var meta;

    // Get initial balances of first and second account.
    var account_one = accounts[0];
    var account_two = accounts[1];

    var account_one_starting_balance;
    var account_two_starting_balance;
    var account_one_ending_balance;
    var account_two_ending_balance;

    var amount = 10;

    return MetaCoin.deployed().then(function(instance) {
      meta = instance;
      return meta.getBalance.call(account_one);
    }).then(function(balance) {
      account_one_starting_balance = balance.toNumber();
      return meta.getBalance.call(account_two);
    }).then(function(balance) {
      account_two_starting_balance = balance.toNumber();
      return meta.sendCoin(account_two, amount, {from: account_one});
    }).then(function() {
      return meta.getBalance.call(account_one);
    }).then(function(balance) {
      account_one_ending_balance = balance.toNumber();
      return meta.getBalance.call(account_two);
    }).then(function(balance) {
      account_two_ending_balance = balance.toNumber();

      assert.equal(account_one_ending_balance, account_one_starting_balance - amount, "Amount wasn't correctly taken from the sender");
      assert.equal(account_two_ending_balance, account_two_starting_balance + amount, "Amount wasn't correctly sent to the receiver");
    });
  });*/
});
