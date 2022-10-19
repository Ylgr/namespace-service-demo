//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BicToken is ERC20 {
    constructor() ERC20("Beincom", "BIC") {
        _mint(msg.sender, 6339777879 * 1e18);
    }
}
