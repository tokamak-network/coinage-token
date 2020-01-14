pragma solidity ^0.5.12;

import { ERC20Mintable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import { ERC20Burnable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";
import {Coinage} from "../Coinage.sol";

contract CoinageMock is ERC20Mintable, ERC20Burnable, Coinage {
  constructor (
    string memory name,
    string memory symbol,
    uint256 factor,
    uint256 factorIncrement,
    bool transfersEnabled
  )
    public
    Coinage(name, symbol, factor, factorIncrement, transfersEnabled)
  {}
}
