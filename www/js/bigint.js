const bigInt = require('big-integer');

class NativeBigIntClass {
  constructor(val, base) {
    if (val.isBigInt) {
      this.value = val.value
      return
    }
    if (base === undefined) {
      this.value = BigInt(val)
    } else if (base === 16) {
      this.value = BigInt("0x" + val)
    } else {
      throw "Invalid base: " + base
    }
    this.isBigInt = true
  }

  static randBetween(low, high) {
    low = NativeBigInt(low)
    high = NativeBigInt(high)
    if (high.lt(low)) {
      throw "Low must be less than High"
    }
    const shift = low.negate()
    low = low.plus(shift)
    high = high.plus(shift)
    const strHigh = high.toString()
    let r = ""
    while (r.length <= strHigh.length + 10) {
      r += Math.round(Math.random() * 1e12).toString()
    }
    const rand = NativeBigInt(r).mod(high.plus(1))
    return rand.minus(shift)
  }

  isZero() {
    return this.value == 0
  }

  isNegative() {
    return this.value < 0
  }

  square() {
    return NativeBigInt(this.value * this.value)
  }

  abs() {
    if (this.value < 0) {
      return NativeBigInt(-this.value)
    } else {
      return this
    }
  }

  negate() {
    return NativeBigInt(-this.value)
  }

  plus(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value + v.value)
  }

  times(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value * v.value)
  }

  minus(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value - v.value)
  }

  over(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value / v.value)
  }

  mod(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value % v.value)
  }

  divmod(v) {
    v = NativeBigInt(v)
    const div = this.value / v.value
    const mod = this.value - div * v.value
    return {
      quotient: NativeBigInt(div),
      remainder: NativeBigInt(mod),
    }
  }

  shiftLeft(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value << v.value)
  }

  shiftRight(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value >> v.value)
  }

  lt(v) {
    v = NativeBigInt(v)
    return this.value < v.value
  }

  gt(v) {
    v = NativeBigInt(v)
    return this.value > v.value
  }

  leq(v) {
    v = NativeBigInt(v)
    return this.value <= v.value
  }

  geq(v) {
    v = NativeBigInt(v)
    return this.value >= v.value
  }

  eq(v) {
    v = NativeBigInt(v)
    return this.value == v.value
  }

  neq(v) {
    return !this.eq(v)
  }

  xor(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value ^ v.value)
  }

  and(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value & v.value)
  }

  toArray(base) {
    const isNegative = this.value < 0
    const ret = []
    let v = this.value
    base = BigInt(base)
    while (v > 0) {
      const div = v / base
      const mod = v - div * base
      ret.push(Number(mod))
      v = div
    }
    return {
      isNegative,
      value: ret.reverse()
    }
  }

  pow(v) {
    v = NativeBigInt(v)
    return NativeBigInt(this.value ** v.value)
  }

  modPow(v, p) {
    v = NativeBigInt(v)
    p = NativeBigInt(p)
    const bin = v.toArray(2).value

    let ans = BigInt(1)

    for (let i = 0; i < bin.length; i++) {
      ans = (ans * ans) % p.value
      if (bin[i]) {
        ans = (ans * this.value) % p.value
      }
    }
    return NativeBigInt(ans % p.value)
  }

  modInv(p) {
    let t = BigInt(0)
    let newT = BigInt(1)
    let r = NativeBigInt(p).value
    let newR = this.abs().value
    let q, lastT, lastR
    while (newR != 0) {
      q = r / newR;
      lastT = t;
      lastR = r;
      t = newT;
      r = newR;
      newT = lastT - (q * newT);
      newR = lastR - (q * newR);
    }
    if (r != 1) throw new Error(this.toString() + " and " + p.toString() + " are not co-prime");
    if (t < 0) {
      t = t + p;
    }
    if (this.isNegative()) {
      return NativeBigInt(-t);
    }
    return NativeBigInt(t)
  }

  toString(base) {
    const a = "a".charCodeAt(0)
    if (base == 16) {
      const vals = this.toArray(16).value
      let ret = ""
      for (let i of vals) {
        if (i >= 10) {
          ret += String.fromCharCode(a + i - 10)
        } else {
          ret += i
        }
      }
      return ret
    } else if( base === undefined) {
      return "" + this.value
    } else {
      throw "Bad base: " + base
    }
  }

  bitLength() {
    if (this.value == 0) {
      return 0
    }
    return this.toArray(2).value.length
  }

  toJSON() {
    return this.toString()
  }

  toJSNumber() {
    if (this.abs().value > Number.MAX_SAFE_INTEGER) {
      throw "Value does not fit in a Javascript integer"
    }
    return Number(this.value)
  }
}

const NativeBigInt = function(val, base) {
  if (val.isBigInt) {
    return val
  }
  return new NativeBigIntClass(val, base);
}

NativeBigInt.randBetween = NativeBigIntClass.randBetween

if (BigInt !== undefined) {
  for(let i = -10; i < 10; i++) {
    NativeBigInt[i] = NativeBigInt(i)
  }
}

module.exports = (BigInt === undefined) ? bigInt : NativeBigInt
