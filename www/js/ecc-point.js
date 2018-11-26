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
				const zz = this.zz || (this.zz = this.z.square())
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
				const z1z1 = this.zz || (this.zz = this.z.square())
				const z2z2 = pt.zz || (pt.zz = pt.z.square())
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
			return this.dub;
		}

		triple() {
			if (!this.trip) {
				if (this.isInf()) {
					this.trip = ECCPoint.zero
				} else {
					this.trip = this.double().plus(this)
				}
			}
			return this.trip
		}

    times(s) {
				if (this.isInf()) {
					return ECCPoint.zero
				}
    		s = bigInt(s).mod(ECCPoint.q).plus(ECCPoint.q).mod(ECCPoint.q)
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
			this.zz = bigInt[1]
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

ECCPoint.p = bigInt("21888242871839275222246405745257275088696311157297823662689037894645226208583");
ECCPoint.q = bigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
ECCPoint.g = new ECCPoint(1, 2);
const nextHashP = (pt) => {
	const hashPt = hash(pt.affine())
	return ECCPoint.findNextY(hashPt).affine()
}
ECCPoint.h = nextHashP(ECCPoint.g)
ECCPoint.hashSet = [nextHashP(ECCPoint.h)]
for (let i = 1; i < 128; i++) {
	ECCPoint.hashSet.push(nextHashP(ECCPoint.hashSet[i - 1]))
}
ECCPoint.zero = new ECCPoint(1, 1, 0);

module.exports = ECCPoint
