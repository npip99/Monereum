const hash = require("./hash");
const bigInt = require('./bigint');

class ECCPoint {
		static decompress(x, key) {
    		x = bigInt(x)
        let p = ECCPoint.p
    		const badPoint = new ECCPoint(p, p)
        if (x >= p) {
        		return badPoint
        } else {
        		const goal = x.times(x).times(x).plus(3).mod(p)
        		let y = goal.modPow(p.plus(1).over(4), p)
            if (y.times(y).mod(p).neq(goal)) {
            		return badPoint
            }
            if (y.isEven() && key === 2 || y.isOdd() && key === 3) {
            		y = p.minus(y).mod(p)
            }
            return new ECCPoint(x, y)
        }
    }

		static findNextY(x) {
			x = bigInt(x)
			let p = ECCPoint.p
			while (true) {
    		const goal = x.square().times(x).plus(3).mod(p)
    		const y = goal.modPow(p.plus(1).over(4), p)
				if (y.square().mod(p).neq(goal)) {
						x = x.plus(1)
						continue;
				}
				return new ECCPoint(x, y)
			}
		}

    constructor(x, y, z) {
        this.x = bigInt(x);
        this.y = bigInt(y);
				if (z === undefined) {
					this.z = bigInt[1];
				} else {
					this.z = bigInt(z);
				}
				if (this.x.eq(0) && this.y.eq(0)) {
					this.z = bigInt[0]
				}
    }

		hashInP() {
			if (this.hashedInP) {
				return this.hashedInP
			}
			this.affine()
			const pHash = hash(this).toArray(2).value.reverse()
			let hashGenerator = ECCPoint.zero
			for (let i = 0; i < 128; i++) {
				if (pHash[i] === 1) {
					hashGenerator = hashGenerator.plus(ECCPoint.hashSet[i])
				}
			}
			return this.hashedInP = hashGenerator
		}

    eq(pt) {
				if (this.isInf()) {
					return pt.isInf()
				}
				if (pt.isInf()) {
					return this.isInf()
				}
    		const p = ECCPoint.p
				const z12 = this.z.square()
				const z13 = z12.times(this.z)
				const z22 = pt.z.square()
				const z23 = z22.times(pt.z)
    		return this.x.times(z22).minus(pt.x.times(z12)).mod(p).eq(0)
						&& this.y.times(z23).minus(pt.y.times(z13)).mod(p).eq(0);
    }

    neq(pt) {
    		return !this.eq(pt);
    }

    isInf() {
    		return this.z.eq(0);
    }

    isInP() {
    		return this.x.lt(ECCPoint.p) && this.y.lt(ECCPoint.p);
    }

    isOnCurve() {
				if (this.isInf()) {
					return false
				}
				const p = ECCPoint.p
    		const x = this.x
        const y = this.y
				const zz = this.z.square()
				const z6 = zz.square().times(zz)
    		return y.square().minus(x.square().times(x).plus(z6.times(3))).mod(p).eq(bigInt[0]);
    }

    isValid() {
    		return this.isInP() && (this.isInf() || this.isOnCurve());
    }

    minus(pt) {
				if (pt.isInf()) {
					return this
				}
    		return this.plus(new ECCPoint(pt.x, bigInt[0].minus(pt.y), pt.z));
    }

    plus(pt) {
				if (this.isInf()) {
					return pt
				}
				if (pt.isInf()) {
					return this
				}
    		const p = ECCPoint.p
				const z1z1 = this.z.square()
				const z2z2 = pt.z.square()
				const u1 = this.x.times(z2z2).mod(p)
				const u2 = pt.x.times(z1z1).mod(p)
				const s1 = this.y.times(z2z2).times(pt.z).mod(p)
				const s2 = pt.y.times(z1z1).times(this.z).mod(p)
				if (u1.eq(u2)) {
					if (s1.eq(s2)) {
						return this.double()
					} else {
						return ECCPoint.zero
					}
				}
				const h = u2.minus(u1)
				const i = h.plus(h).square()
				const j = h.times(i)
				const r = s2.minus(s1).shiftLeft(1)
				const v = u1.times(i)
				const x3 = r.square().minus(j).minus(v.shiftLeft(1)).mod(p)
				const y3 = r.times(v.minus(x3)).minus(s1.times(j).shiftLeft(1)).mod(p)
				const z3 = this.z.plus(pt.z).square().minus(z1z1).minus(z2z2).times(h).mod(p)
				return new ECCPoint(x3, y3, z3);
    }

		double() {
			if (this.dub) {
				return this.dub
			}
			if (this.isInf()) {
				return this.dub = ECCPoint.zero
			}
			const p = ECCPoint.p
			const x2 = this.x.square()
			const y2 = this.y.square()
			const y4 = y2.square()
			const z2 = this.z.square()
			const s = this.x.plus(y2).square().minus(x2).minus(y4).shiftLeft(1)
			const m = x2.times(3)
			const x = m.square().minus(s.shiftLeft(1)).mod(p)
			const y = m.times(s.minus(x)).minus(y2.square().shiftLeft(3)).mod(p)
			const z = this.y.plus(this.z).square().minus(y2).minus(z2).mod(p)
			this.dub = new ECCPoint(x, y, z);
			if (this.useSave) {
				this.dub.affine()
			}
			return this.dub;
		}
		
		// Assumes !this.isInf() && 0 < s < q
		
		// 31ms first time, 14ms each additional time
    savedTimes(s) {
        let bin = s.toArray(2).value
        let ans = ECCPoint.zero
        let pow = this
        for( let i = bin.length - 1; i >= 0; i-- ) {
						if (bin[i] === 1) {
							ans = ans.plus(pow)
						}
            pow = pow.double()
        }
        return ans;
    }
		
		// 17ms each time
    times(s) {
			if (this.isInf()) {
				return ECCPoint.zero
			}
			s = bigInt(s).mod(ECCPoint.q).plus(ECCPoint.q).mod(ECCPoint.q)
			if (s.isZero()) {
				return ECCPoint.zero
			}
      if (this.useSave) {
        return this.savedTimes(s)
      }
			
			// Solving the below:
      // [k, 0] = b1[v1[0], v1[1]], b2[v2[0], v2[1]]
      // k = b1*v1[0] + b2*v2[0]
      // 0 = b1*v1[1] + b2*v2[1]
      // -b2*v2[1] / v1[1] = b1
      // k = (-b2*v2[1] / v1[1]) * v1[0] + b2*v2[0]
      // k = b2 * (-v2[1] / v1[1] * v1[0] + v2[0])
      // k / (-v2[1] / v1[1] * v1[0] + v2[0]) = b2
      // k * v1[1] / (-v2[1] * v1[0] + v2[0] * v1[1]) = b2
      // k * v2[1] / (-v1[1] * v2[0] + v1[0] * v2[1]) = b1
			// =>
			// b1 = k * v2[1] / (-v1[1] * v2[0] + v1[0] * v2[1])
			// b2 = k * v1[1] / (-v2[1] * v1[0] + v2[0] * v1[1])
			// Then, we round to the nearest integer
			
      const v1 = ECCPoint.v1
      const v2 = ECCPoint.v2
			const cross = ECCPoint.cross
			
			// Calculate b1
      let divmod = s.times(v2[1]).divmod(cross.times(-1))
      if (divmod.remainder.abs().gt(cross.shiftRight(1))) {
        let round = divmod.quotient.isNegative() ? bigInt[-1] : bigInt[1]
        divmod.quotient = divmod.quotient.plus(round)
      }
      const b1 = divmod.quotient
			
			// Calculate b2
      divmod = s.times(v1[1]).divmod(cross)
      if (divmod.remainder.abs().gt(cross.shiftRight(1))) {
        let round = divmod.quotient.isNegative() ? bigInt[-1] : bigInt[1]
        divmod.quotient = divmod.quotient.plus(round)
      }
      const b2 = divmod.quotient
			
			// Solve for k1, k2
      const v = [b1.times(v1[0]).plus(b2.times(v2[0])), b1.times(v1[1]).plus(b2.times(v2[1]))]
      const k1 = s.minus(v[0])
      const k2 = bigInt[0].minus(v[1])
			
			// L1P = this.times(ECCPoint.L1), because math
      const L1P = new ECCPoint(this.x.times(ECCPoint.cb2), this.y, this.z)
			
			// arr =
      // 0, a, 2a, 3a
      // b, b+a, b+2a, b+3a
      // 2b, 2b+a, 2b+2a, 2b+3a
      // 3b, 3b+a, 3b+2a, 3b+3a
			
      const arr = [ECCPoint.zero]
      if (k1.isNegative()) {
        arr.push(new ECCPoint(this.x, this.y.times(-1), this.z))
      } else {
        arr.push(this)
      }
      arr.push(arr[arr.length - 1].double())
      arr.push(arr[arr.length - 1].plus(arr[arr.length-2]))
			
      for (let i = 1; i < 4; i++ ) {
        if (i == 1) {
          if (k2.isNegative()) {
            arr.push(new ECCPoint(L1P.x, L1P.y.times(-1), L1P.z))
          } else {
            arr.push(L1P)
          }
        } else if (i == 2) {
          arr.push(arr[arr.length - 4].double())
        } else {
          arr.push(arr[arr.length - 4].plus(arr[4]))
        }
        arr.push(arr[arr.length - 1].plus(arr[1]))
        arr.push(arr[arr.length - 2].plus(arr[2]))
        arr.push(arr[arr.length - 3].plus(arr[3]))
      }
			
			// Prepare binary representation of k1 & k2
      let k1bin = k1.abs().toArray(4).value
      let k2bin = k2.abs().toArray(4).value
      const diff = k2bin.length - k1bin.length
      if (diff > 0) {
        k1bin = Array(diff).fill(0).concat(k1bin)
      } else {
        k2bin = Array(-diff).fill(0).concat(k2bin)
      }
			
			// Calculate using the below algorithm:
      //   2 * (2 * (2 * (0) + 0) + A) + A
      // + 2 * (2 * (2 * (B) + 0) + B) + 0
      // = 2 * (2 * (2 * (B) + 0) + (A+B)) + A
			// In this case, A = this, B = this.times(L1) = L1P
			// Additionally, we use base 4 as opposed to binary
      let ans = ECCPoint.zero
      for( let i = 0; i < Math.max(k1bin.length, k2bin.length); i++ ) {
        ans = ans.double().double()
        let ind = k1bin[i] + 4 * k2bin[i]
        if (ind > 0) {
          ans = ans.plus(arr[ind])
        }
      }
      return ans
    }

		affine() {
			if (this.isInf()) {
				this.x = bigInt[0]
				this.y = bigInt[0]
				return this
			}
			const p = ECCPoint.p
			const zinv = this.z.modInv(p)
			const zinv2 = zinv.times(zinv)
			const zinv3 = zinv2.times(zinv)
			let x = this.x.times(zinv2).mod(p)
			if (x.isNegative()) {
				x = x.plus(p)
			}
			let y = this.y.times(zinv3).mod(p)
			if (y.isNegative()) {
				y = y.plus(p)
			}
			this.x = x
			this.y = y
			this.z = bigInt[1]
			return this;
		}

    toString() {
			const aff = this.affine()
    	return "ECCPoint(" + aff.x.toString() + ", " + aff.y.toString() + ")"
    }

		toJSON() {
			const aff = this.affine()
			return {
				x: aff.x.toString(),
				y: aff.y.toString()
			}
		}
}

// === Set parameters ===
ECCPoint.p = bigInt("21888242871839275222246405745257275088696311157297823662689037894645226208583");
ECCPoint.q = bigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
ECCPoint.zero = new ECCPoint(1, 1, 0);

// === Precalculate for fast multiplication ===
// Read more here: https://www.iacr.org/archive/crypto2001/21390189.pdf

// Solutions to L^2 + L + 1 = 0 (mod q)
const L1 = ECCPoint.L1 = bigInt("4407920970296243842393367215006156084916469457145843978461")
// const L2 = bigInt("21888242871839275217838484774961031246154997185409878258781734729429964517155")

if (!L1.square().plus(L1).plus(1).mod(ECCPoint.q).eq(0)) {
	throw "Bad L1"
}

// Solutions to L^3 = 1 (mod p)
// const cb0 = bigInt[1]
// const cb1 = bigInt[3].modPow(p.minus(1).over(3), p)
const cb2 = ECCPoint.cb2 = bigInt[3].modPow(ECCPoint.p.minus(1).over(3).times(2), ECCPoint.p)

if (!cb2.modPow(3, ECCPoint.p)) {
	throw "Bad cb2"
}

// We want two v's s.t. v[0] + v[1]*L1 = k*p, for some k

// Euclidean Algorithm
const s = [bigInt[1], bigInt[0]]
const t = [bigInt[0], bigInt[1]]
const r = [ECCPoint.q, L1]

let len = 2
while( !r[len - 1].isZero() ) {
  const divmod = r[len - 2].divmod(r[len - 1])
  s.push(s[len - 2].minus(divmod.quotient.times(s[len - 1])))
  t.push(t[len - 2].minus(divmod.quotient.times(t[len - 1])))
  r.push(divmod.remainder)
  len++
}
for (let i = len - 1; i >= 0; i--) {
	// Here we pick the most efficient v
  if (r[i].times(r[i]).geq(ECCPoint.q)) {
    v1 = [r[i + 1], t[i + 1].times(-1)]
    v2 = [r[i], t[i].times(-1)]
    v22 = [r[i + 2], t[i + 2].times(-1)]
    if (v22[0].square().plus(v22[1].square()).lt(v2[0].square().plus(v2[1].square()))) {
      v2 = v22
    }
    break
  }
}
ECCPoint.v1 = v1
ECCPoint.v2 = v2
// (-v2[1] * v1[0] + v2[0] * v1[1])
ECCPoint.cross = v2[0].times(v1[1]).minus(v2[1].times(v1[0]))

// === Initialize Constants ===
ECCPoint.g = new ECCPoint(1, 2);
ECCPoint.g.useSave = true
const nextHashP = (pt) => {
	const hashPt = hash(pt.affine())
	return ECCPoint.findNextY(hashPt).affine()
}
ECCPoint.h = nextHashP(ECCPoint.g)
ECCPoint.h.useSave = true
ECCPoint.hashSet = [nextHashP(ECCPoint.h)]
for (let i = 1; i < 128; i++) {
	ECCPoint.hashSet.push(nextHashP(ECCPoint.hashSet[i - 1]))
}

module.exports = ECCPoint
