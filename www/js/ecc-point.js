const bigInt = require('big-integer');

class ECCPoint {
		static decompress(x, key) {
    		x = bigInt(x)
        let p = ECCPoint.p
    		const badPoint = new ECCPoint(p, p)
        if (x >= p) {
        		return badPoint
        } else {
        		goal = x.times(x).mod(p).times(x).plus(3).mod(p)
        		y = goal.modPow(p.plus(1).times(bigInt[4].modInv(p)), p)
            if (y.times(y).minus(goal).mod(p).neq(bigInt[0])) {
            		return badPoint
            }
            if (y.mod(2).neq(bigInt(key))) {
            		y = p.minus(y).mod(p)
            }
            return new ECCPoint(x, y)
        }
    }

    constructor(x, y) {
        this.x = bigInt(x);
        this.y = bigInt(y);
    }

    eq(pt) {
    		return this.x.eq(pt.x) && this.y.eq(pt.y);
    }

    neq(pt) {
    		return !this.eq(pt);
    }

    isInf() {
    		return this.x.eq(bigInt(0)) && this.y.eq(bigInt(0));
    }

    isInP() {
    		return this.x.lt(ECCPoint.p) && this.y.lt(ECCPoint.p);
    }

    isOnCurve() {
    		const x = this.x
        const y = this.y
        const p = ECCPoint.p
    		return y.times(y).mod(p).minus(x.times(x).mod(p).times(x).mod(p).plus(3)).mod(p).eq(bigInt[0]);
    }

    isValid() {
    		return this.isInP() && (this.isInf() || this.isOnCurve());
    }

    minus(pt) {
    		if (!pt.isValid() || !this.isValid()) {
        		return new ECCPoint(ECCPoint.p, ECCPoint.p);
        }
    		return this.plus(new ECCPoint(pt.x, ECCPoint.p.minus(pt.y).mod(ECCPoint.p)))
    }

    plus(pt) {
    		const p = ECCPoint.p
    		if (!pt.isValid() || !this.isValid()) {
        		return new ECCPoint(p, p);
        }
        if (this.isInf()) {
        		return pt
        } else if(pt.isInf()) {
        		return this
        }
        let slope = 0
    		if (this.x.eq(pt.x)) {
        		slope = bigInt[3].times(pt.x).times(pt.x).mod(p).times(bigInt[2].times(pt.y).modInv(p)).mod(p)
        } else {
        		slope = pt.y.minus(this.y).times(pt.x.minus(this.x).modInv(p)).mod(p)
        }
        let x = slope.times(slope).minus(this.x).minus(pt.x)
        let y = slope.times(pt.x.minus(x)).minus(pt.y)
        x = x.mod(p).plus(p).mod(p)
        y = y.mod(p).plus(p).mod(p)
        return new ECCPoint(x, y)
    }

    times(s) {
    		if (!this.isValid()) {
        		return new ECCPoint(ECCPoint.p, ECCPoint.p);
        }
    		s = bigInt(s).mod(ECCPoint.q)
        let bin = s.toArray(2).value
        let ans = ECCPoint.zero
        let pow = this
        for(let i = bin.length - 1; i >= 0; i--) {
        		if (bin[i] == 1) {
            		ans = ans.plus(pow)
            }
            pow = pow.plus(pow)
        }
        return ans
    }

    toString() {
    		return "ECCPoint(" + this.x.toString() + ", " + this.y.toString() + ")"
    }
}

ECCPoint.p = bigInt("21888242871839275222246405745257275088696311157297823662689037894645226208583");
ECCPoint.q = bigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
ECCPoint.g = new ECCPoint(1, 2);
ECCPoint.zero = new ECCPoint(0, 0)

module.exports = ECCPoint
