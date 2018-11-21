const leftPad = require('left-pad');
var CryptoJS = require('crypto-js');
var sha3 = require('crypto-js/sha3');
const bigInt = require('big-integer');

const padInt = i => {
  if (i.bitLength && i.bitLength() > 256) {
    console.error(i, " has bit length more than 256");
  }
  if (i < 0) {
    console.error(i, " is a negative number");
  }
  leftPad(i.toString(16), 64, 0)
};
const padItem = i => {
  let hex;
  if (i.x) {
    hex = padInt(i.x) + padInt(i.y);
  } else {
    hex = padInt(i)
  }
  return hex
};

const hash = function() {
  let hex = ""
  console.log(arguments)
  for (let i = 0; i < arguments.length; i++) {
    const arg = arguments[i]
    if (arg.length) {
      console.log(arg, arg.length)
      hex += arg.map(padItem).join("")
    } else {
      hex += padItem(arg)
    }
  }
  const value = CryptoJS.enc.Hex.parse(hex)
  return bigInt(sha3(value, {
      outputLength: 256
  }).toString(), 16);
}

module.exports = hash
