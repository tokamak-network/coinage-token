pragma solidity ^0.5.12;

import { ERC20Mintable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import { ERC20Burnable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";
import { FixedIncrementCoinage } from "../FixedIncrementCoinage.sol";

contract FixedIncrementCoinageMock is ERC20Mintable, ERC20Burnable, FixedIncrementCoinage {
  constructor (
    string memory name,
    string memory symbol,
    uint256 factor,
    uint256 seigPerBlock,
    bool transfersEnabled
  )
    public
    FixedIncrementCoinage(name, symbol, factor, seigPerBlock, transfersEnabled)
  {}
}
