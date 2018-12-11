const CryptoJS = require('crypto-js')
const sha3 = require('crypto-js/sha3')
const bigInt = require('big-integer')

const leftPad = (s, goal, rep) => {
  const rem = goal - s.length
  let ret = s
  for(let i = 0; i < rem; i++) {
    ret = rep + ret
  }
  return ret
}

const padInt = i => {
  if (i.bitLength && i.bitLength() > 256) {
    console.error(i + " has bit length more than 256");
  }
  if (i < 0) {
    console.error(i + " is a negative number");
  }
  return leftPad(i.toString(16), 64, 0);
};

const padPt = i => {
  if (i.isInf()) {
    return padInt(0) + padInt(0)
  } else {
    if (i.z.neq(1)) {
      console.error("Point is not in affine coordinates")
    }
    return padInt(i.x) + padInt(i.y);
  }
};

const padPtOrInt = i => {
  if (i.x) {
    return padPt(i)
  } else {
    return padInt(i)
  }
}

const padBytes = function(hex) {
  const remaining = (2*32 - hex.length % (2*32)) % (2*32);
  for (let j = 0; j < remaining; j++) {
    hex += '0';
  }
  return hex
}

const format = function() {
  const parsedArgs = [];
  let heap = "";
  for (let i = 0; i < arguments.length; i++) {
    const arg = arguments[i];
    if (arg === undefined) {
      continue
    }
    if (typeof arg === "string") {
      let hex = ""
      for (let j = 0; j < arg.length; j++) {
        digit = arg.charCodeAt(j).toString(16);
        hex += ("0" + digit).slice(-2);
      }
      hex = padInt(arg.length) + padBytes(hex)
      parsedArgs.push(heap.length / 2);
      heap += hex;
    } else if (arg.length) {
      if (arg.static) {
        parsedArgs.push(arg.map(padPtOrInt).join(""))
      } else if (arg.bytes) {
        let len = 0
        let hex = ""
        for (let i = 0; i < arg.length; i++) {
          if (typeof arg[i] === "string") {
            len += arg[i].length / 2
            hex += padBytes(arg[i])
          } else {
            len += 32
            hex += padInt(arg[i])
          }
        }
        hex = padInt(len) + hex
        parsedArgs.push(heap.length / 2);
        heap += hex;
      } else {
        let hex = padInt(arg.length) + arg.map(a => a.static ? a.map(padPtOrInt).join("") : padPtOrInt(a)).join("")
        parsedArgs.push(heap.length / 2);
        heap += hex;
      }
    } else {
      parsedArgs.push(padPtOrInt(arg));
    }
  }
  let sizeOfArg = 0;
  for (const i of parsedArgs) {
    if (typeof i === "number") {
      sizeOfArg += 32;
    } else {
      sizeOfArg += i.length / 2;
    }
  }
  for (const i in parsedArgs) {
    if (typeof parsedArgs[i] === "number") {
      parsedArgs[i] = padInt(sizeOfArg + parsedArgs[i]);
    }
  }
  const hex = parsedArgs.join("") + heap;
  return hex;
}

// Creates hash for Solidity functions
const funcHash = function(str) {
  let hex = "";
  for (let i = 0; i < str.length; i++) {
      digit = str.charCodeAt(i).toString(16);
      hex += ("0" + digit).slice(-2);
  }

  const value = CryptoJS.enc.Hex.parse(hex)
  const h = bigInt(sha3(value, {
      outputLength: 256
  }).toString(), 16)
  return padInt(h);
}

const hash = function() {
  const hex = format(...arguments)
  const value = CryptoJS.enc.Hex.parse(hex)
  return bigInt(sha3(value, {
      outputLength: 256
  }).toString(), 16);
}

const abi = {
  format,
  funcHash,
  hash,
  padPtOrInt,
  padPt,
  padInt,
  padBytes,
}

module.exports = abi
