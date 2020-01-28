pragma solidity ^0.5.12;

import { ERC20Mintable } from "../../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import { ERC20Burnable } from "../../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";
import { CustomIncrementCoinage } from "../CustomIncrementCoinage.sol";

contract CustomIncrementCoinageMock is ERC20Mintable, ERC20Burnable, CustomIncrementCoinage {
  constructor (
    string memory name,
    string memory symbol,
    uint256 factor,
    bool transfersEnabled
  )
    public
    CustomIncrementCoinage(name, symbol, factor, transfersEnabled)
  {}
}
