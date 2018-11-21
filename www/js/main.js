const wallet = require('./wallet')
const bigInt = require('big-integer')
const hash = require('./hash')

console.log(hash(1, 2))

const w = new wallet("hey");
console.log(w.getPrivateKey().toString())
console.log(bigInt("123482342374823974289127341273847293481239741283497"))
