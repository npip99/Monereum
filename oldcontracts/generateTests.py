p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
q = 21888242871839275222246405745257275088548364400416034343698204186575808495617
mixin = 3

import sha3
import binascii

def inv(x, m):
    return pow(x, m - 2, m)

def generateNextPoint(g):
    ret = None
    testX = g % p
    while True:
        goal = pow(testX, 3, p)
        goal += 3
        testY = pow(goal, (p + 1)/4, p)
        if pow(testY, 2, p) != goal:
            testX += 1
            continue
        else:
            ret = Point(testX, testY)
            break
    return ret

class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y
    def is_inf(self):
        return (self.x == 0 and self.y == 0)
    def is_on_curve(self):
        return (is_inf(self) or ((self.y * self.y - self.x * self.x * self.x - 3) % p) == 0) and self.y < p and self.x < p
    def __add__(self, other):
        if not is_on_curve(self) or not is_on_curve(other):
            return Point(p, p)
        p1 = self
        p2 = other
        if p1 == zero:
            return p2
        if p2 == zero:
            return p1
        if p1.x == p2.x and (p1.y != p2.y or p1.y == 0):
            # p1 + -p1 == 0
            return zero
        if p1.x == p2.x:
            # p1 + p1: use tangent line of p1 as (p1,p1) line
            l = (3 * p1.x * p1.x) * inv(2 * p1.y, p) % p
        else:
            l = (p2.y - p1.y) * inv(p2.x - p1.x, p) % p
        x = (l * l - p1.x - p2.x) % p
        y = (l * (p1.x - x) - p1.y) % p
        return Point(x, y)
    def __mul__(self, scalar):
        if not is_on_curve(self):
            return Point(p, p)
        ans = zero
        power = self
        for i in "{0:b}".format(scalar)[::-1]:
            if i == "1":
                ans = ans + power
            power = power + power
        return ans
    def __repr__(self):
        return "Point(" + str(self.x) + ", " + str(self.y) + ")"

def hash(*argv):
    f = ""
    for arg in argv:
        if isinstance(arg, Point):
            f += binascii.unhexlify("{:064x}".format(arg.x))
            f += binascii.unhexlify("{:064x}".format(arg.y))
        else:
            f += binascii.unhexlify("{:064x}".format(arg))
    return int(sha3.keccak_256(f).hexdigest(), 16)


zero = Point(0, 0)
g = Point(1, 2)

h = generateNextPoint(hash(g))
hashSet = [generateNextPoint(hash(h))]
for i in range(1, 128):
    hashSet.append(generateNextPoint(hash(hashSet[-1])))

seed = 1234

def rand():
    global seed
    seed = hash(seed)
    return seed

keys = []
pubs = []

for i in range(20):
    keys.append(rand() % q)
    pubs.append(g * keys[-1])

def generateRingProof(pubs, privateKeys):
    funds = pubs[:mixin]
    fundDest = pubs[0]
    keyImage = hashInP(fundDest) * privateKeys[0]
    commitment = h * 100
    outputHash = hash(g)
    a = rand() % q
    b = rand() % q
    fundCheck = g * a
    imageCheck = hashInP(fundDest) * a;
    commitmentCheck = g * b
    imageFundProofs = [None, None, None]
    commitmentProofs = [None, None, None]
    prevHash = hash(fundCheck, imageCheck, commitmentCheck, outputHash)
    for i in range(1, mixin):
        fundDest = funds[i]
        imageFundProofs[i] = rand() % q
        commitmentProofs[i] = rand() % q
        fundCheck = fundDest * prevHash + g * imageFundProofs[i]
        imageCheck = keyImage * prevHash + hashInP(fundDest) * imageFundProofs[i]
        commitmentCheck = g * commitmentProofs[i]

        prevHash = hash(fundCheck, imageCheck, commitmentCheck, outputHash)
    imageFundProofs[0] = (a + q - (prevHash * privateKeys[0]) % q) % q
    commitmentProofs[0] = b
    borromean = prevHash
    return {
        "funds": funds,
        "keyImage": keyImage,
        "commitment": commitment,
        "borromean": borromean,
        "imageFundProofs": imageFundProofs,
        "commitmentProofs": commitmentProofs,
        "outputHash": outputHash
    }

def pretty(p):
    if isinstance(p, list):
        return "[" + ",".join([pretty(k) for k in p]) + "]"
    elif isinstance(p, Point):
        return "[" + pretty(p.x) + ", " + pretty(p.y) + "]"
    else:
        return "\"" + str(p) + "\""

def formatRangeProof(rp):
    rep = ""
    rep += "["
    for i in range(mixin):
        rep += pretty(rp["funds"][i])
        if i != mixin - 1:
            rep += ","
    rep += "]"
    rep += ", " + pretty(rp["keyImage"])
    rep += ", "  + pretty(rp["commitment"])
    rep += ", " + pretty(rp["borromean"])
    rep += ", " + pretty(rp["imageFundProofs"])
    rep += ", " + pretty(rp["commitmentProofs"])
    rep += ", " + pretty(rp["outputHash"])
    return rep


initializeH()

rp = generateRingProof(pubs, keys)
print(pubs[0])
print(rp)
print("\r\n")
print(formatRangeProof(rp))
print("\r\n")

print("H: ", h)
