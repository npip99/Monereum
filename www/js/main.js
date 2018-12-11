const wallet = require('./wallet')
const bigInt = require('big-integer')
const abi = require('./abi')
const pt = require('./ecc-point')
const txhandler = require('./txhandler')
const miner = require('./miner')
const constants = require('./constants')
const parser = require('./parser')
const disputer = require('./disputer')
const aes = require('aes-js')

window.addEventListener('load', async () => {
    if (window.ethereum) {
        // Modern dapp browsers...
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
    } else if (window.web3) {
      // Legacy dapp browsers...
      window.web3 = new Web3(web3.currentProvider);
      // Acccounts always exposed
    } else {
      // Non-dapp browsers...
      console.error('Non-Ethereum browser detected. You should consider trying MetaMask!');
      return;
    }

    const strToHex = s => aes.utils.hex.fromBytes(aes.utils.utf8.toBytes(s))
    const hexToStr = h => aes.utils.utf8.fromBytes(aes.utils.hex.toBytes(h))

    window.constants = constants
    window.aes = aes
    window.pt = pt
    window.bigInt = bigInt
    window.abi = abi
    window.parser = parser
    window.disputer = disputer
    const result = document.getElementById("result")
    const log = document.getElementById("log")
    let refreshTimer = null
    window.syncHandler = null

    changePerson = e => {
      e.preventDefault()
      const form = e.target
      const id = parseInt(form.elements.id.value)
      if (refreshTimer) {
        clearInterval(refreshTimer)
      }
      if (syncHandler) {
        syncHandler.stopped = true
      }
      if (id === 0) {
        document.getElementById("miner_form").style = "display: block;"
        document.getElementById("wallet_form").style = "display: none;"
        setTimeout(() => {
          window.person = new wallet("miner" + Math.random())
          window.m = new miner(person, window.web3)
          window.d = new disputer(person, window.web3)
          window.web3.eth.getBlockNumber((error, result) => {
            d.handler.sync(result)
            //d.tryDispute()
          })
          refreshTimer = setInterval(() => {
            window.web3.eth.getBlockNumber((error, result) => {
              if (d.handler.doneSyncing) {
                clearInterval(refreshTimer)
                console.log("Syncing")
                //d.handler.sync(result)
                d.tryDispute()
              }
            })
          }, 1000)
        }, 0)
      } else {
        document.getElementById("miner_form").style = "display: none;"
        document.getElementById("wallet_form").style = "display: block;"
        result.innerHTML = "Loading..."
        log.innerHTML = ""
        setTimeout(() => {
          window.person = new wallet("Person #" + id)
          window.handler = new txhandler(person, window.web3)
          handler.addReceiveListener(tx => {
            let msgDisplay = ""
            if (typeof tx.receiverData.msg === "string") {
              msgDisplay = " | " + hexToStr(tx.receiverData.msg)
            }
            log.innerHTML += "Received " + tx.receiverData.amount + msgDisplay + " (" + tx.id.toString(16) + ")" + "<br/>"
          })
          /*
          handler.addSpendListener(tx => {
            log.innerHTML += "Spent " + tx.receiverData.amount + " (" + tx.id.toString(16) + ")" + "<br/>"
          })
          */
          const numKeys = parseInt(form.elements.numKeys.value) || 0
          for (let i = 0; i < numKeys; i++) {
            handler.getPublicKey()
          }
          let first = true
          const syncHandler = () => {
            console.log("Syncing...")
            window.web3.eth.getBlockNumber((error, result) => {
              if (result <= handler.position) {
                setTimeout(syncHandler, 1000);
                return
              }
              handler.sync(result, () => {
                if (first) {
                  window.result.innerHTML = "Done!"
                }
                first = false
                if (!syncHandler.stopped) {
                  syncHandler()
                }
              })
            })
          }
          window.syncHandler = syncHandler
          syncHandler()
        }, 0)
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
      const msg = form.elements.msg.value
      result.innerHTML = JSON.stringify(handler.createFullTx(parser.parseJSONKey(JSON.parse(pubKey)), amount, 3, strToHex(msg)))
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
