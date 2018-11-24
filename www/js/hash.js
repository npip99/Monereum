var CryptoJS = require('crypto-js');
var sha3 = require('crypto-js/sha3');
const bigInt = require('./bigint');

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
    throw (i + " has bit length more than 256");
  }
  if (i < 0) {
    throw (i + " is a negative number");
  }
  return leftPad(i.toString(16), 64, 0);
};
const padItem = i => {
  if (i.x) {
    if (i.z.neq(1) && i.z.neq(0)) {
      throw (i + " is not in affine coordinates")
    }
    return padInt(i.x) + padInt(i.y);
  } else {
    return padInt(i)
  }
};

const format = function() {
  const parsedArgs = [];
  let heap = "";
  for (let i = 0; i < arguments.length; i++) {
    const arg = arguments[i];
    if (typeof arg === "string") {
      let hex = padInt(arg.length)
      for (let j = 0; j < arg.length; j++) {
        hex += arg.charCodeAt(j).toString(16)
      }
      const remaining = hex.length % 64;
      for (let j = 0; j < remaining; j++) {
        hex += '0';
      }
      parsedArgs.push(heap.length / 2);
      heap += hex;
    } else if (arg.length) {
      if (arg.static) {
        parsedArgs.push(arg.map(padItem).join(""))
      } else {
        console.log("ITEM: ", arg, arg.map(a => a.static ? a.map(padItem).join("") : padItem(a)), "\n")
        let hex = padInt(arg.length) + arg.map(a => a.static ? a.map(padItem).join("") : padItem(a)).join("")
        parsedArgs.push(heap.length / 2);
        heap += hex;
      }
    } else {
      parsedArgs.push(padItem(arg));
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

const hash = function() {
  const parsedArgs = [];
  let heap = "";
  for (let i = 0; i < arguments.length; i++) {
    const arg = arguments[i];
    if (typeof arg === "string") {
      let hex = padInt(arg.length)
      for (let j = 0; j < arg.length; j++) {
        hex += arg.charCodeAt(j).toString(16)
      }
      const remaining = hex.length % 64;
      for (let j = 0; j < remaining; j++) {
        hex += '0';
      }
      parsedArgs.push(heap.length / 2);
      heap += hex;
    } else if (arg.length) {
      if (arg.static) {
        parsedArgs.push(arg.map(padItem).join(""))
      } else {
      let hex = padInt(arg.length) + arg.map(a => a.static ? a.map(padItem).join("") : padItem(a)).join("")
        parsedArgs.push(heap.length / 2);
        heap += hex;
      }
    } else {
      parsedArgs.push(padItem(arg));
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
  const value = CryptoJS.enc.Hex.parse(hex)
  return bigInt(sha3(value, {
      outputLength: 256
  }).toString(), 16);
}

hash.format = format

module.exports = hash
