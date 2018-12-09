const wallet = require('./wallet')
const bigInt = require('./bigint');
const hash = require('./hash')
const pt = require('./ecc-point')
const txhandler = require('./txhandler')
const miner = require('./miner')
const constants = require('./constants')
const parser = require('./parser')
const aes = require('aes-js')

window.addEventListener('load', async () => {
    // Modern dapp browsers...
    if (window.ethereum) {
        window.web3 = new Web3(ethereum);
        try {
            // Request account access if needed
            await ethereum.enable();
            // Acccounts now exposed
        } catch (error) {
            console.error(error);
            return;
            // User denied account access...
        }
    }
    // Legacy dapp browsers...
    else if (window.web3) {
        window.web3 = new Web3(web3.currentProvider);
        // Acccounts always exposed
    }
    // Non-dapp browsers...
    else {
        console.error('Non-Ethereum browser detected. You should consider trying MetaMask!');
        return;
    }

    window.constants = constants
    window.aes = aes
    window.pt = pt
    window.bigInt = bigInt
    window.hash = hash
    window.parser = parser
    const result = document.getElementById("result")
    const log = document.getElementById("log")
    let refreshTimer = null

    window.m = new miner(new wallet("miner" + Math.random()), window.web3)

    changePerson = e => {
      e.preventDefault()
      const form = e.target
      const id = parseInt(form.elements.id.value)
      if (refreshTimer) {
        clearInterval(refreshTimer)
      }
      if (id === 0) {
        document.getElementById("miner_form").style = "display: block;"
        document.getElementById("wallet_form").style = "display: none;"
      } else {
        window.person = new wallet("Person #" + id)
        window.handler = new txhandler(person, window.web3)
        handler.addReceiveHandler(tx => {
          let msgDisplay = ""
          if (tx.receiverData.msg) {
            msgDisplay = " | " + tx.receiverData.msg
          }
          log.innerHTML += "Received " + tx.receiverData.amount + msgDisplay + " (" + tx.id.toString(16) + ")" + "<br/>"
        })
        handler.addSpendHandler(tx => {
          log.innerHTML += "Spent " + tx.receiverData.amount + " (" + tx.id.toString(16) + ")" + "<br/>"
        })
        const numKeys = parseInt(form.elements.numKeys.value) || 0
        for (let i = 0; i < numKeys; i++) {
          handler.getPublicKey()
        }
        window.web3.eth.getBlockNumber((error, result) => {
          handler.sync(result)
        })
        refreshTimer = setInterval(() => {
          window.web3.eth.getBlockNumber((error, result) => {
            if (handler.doneSyncing) {
              console.log("Syncing to: ", result)
              handler.sync(result)
            }
          })
        }, 1000)
        document.getElementById("miner_form").style = "display: none;"
        document.getElementById("wallet_form").style = "display: block;"
      }
    }

    getPublicKey = e => {
      e.preventDefault()
      result.innerHTML = JSON.stringify(handler.getPublicKey())
    }

    createTx = e => {
      e.preventDefault()
      const form = e.target
      const amount = form.elements.amount.value
      const key = handler.getPublicKey()
      result.innerHTML = JSON.stringify(handler.createMint(amount))
    }

    createFullTx = e => {
      e.preventDefault()
      const form = e.target
      const pubKey = form.elements.to.value
      const amount = form.elements.amount.value
      result.innerHTML = JSON.stringify(handler.createFullTx(parser.parseJSONKey(JSON.parse(pubKey)), amount, 3))
    }

    mintTx = e => {
      e.preventDefault()
      const form = e.target
      const tx = form.elements.tx.value
      m.mint(parser.parseJSONTx(JSON.parse(tx)))
    }

    submitFullTx = e => {
      e.preventDefault()
      const form = e.target
      const fullTx = form.elements.fullTx.value
      m.submit(parser.parseJSONFullTx(JSON.parse(fullTx)))
    }
});
