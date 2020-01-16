pragma solidity ^0.5.12;

import { ERC20Mintable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import { ERC20Burnable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";
import { AutoIncrementCoinage } from "../AutoIncrementCoinage.sol";

contract AutoIncrementCoinageMock is ERC20Mintable, ERC20Burnable, AutoIncrementCoinage {
  constructor (
    string memory name,
    string memory symbol,
    uint256 factor,
    uint256 factorIncrement,
    bool transfersEnabled
  )
    public
    AutoIncrementCoinage(name, symbol, factor, factorIncrement, transfersEnabled)
  {}
}
