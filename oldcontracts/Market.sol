import "./Monereum.sol";

contract MonereumExchange {
    enum Direction {
        Buy, // Buy Monereum
        Sell // Sell Monereum (Buy ETH)
    }

    struct Order {
        Direction d;
        uint256 price;
        uint256 amount;
    }

    mapping(uint256 => Order) orders;

    MonereumBlockchain blk;

    function marketOrder(Direction d, uint256 price, uint256 src, uint256 signature) public payable {
        Order o;
        o.d = d;
        o.price = price;
        require(price < (1 << 128));
        if (d == Direction.Buy) {
            o.amount = msg.value;
            orders[uint256(msg.sender)] = o;
            emit LogMarketOrder("Buy", price, o.amount, uint256(msg.sender));
        } else {
            require(blk.verifySignature(src, uint256(keccak256("marketOrder", d, price)), signature));
            o.amount = blk.getContractTransaction(uint256(this), src);
            require(o.amount < (1 << 128));
            orders[src] = o;
            emit LogMarketOrder("Sell", price, o.amount, src);
        }
    }

    event LogMarketOrder(string d, uint256 price, uint256 amount, uint256 src);

}
