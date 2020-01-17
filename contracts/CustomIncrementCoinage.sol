pragma solidity ^0.5.12;

import { AutoIncrementCoinage } from "./AutoIncrementCoinage.sol";


/**
 * @dev FixedIncrementCoinage increases balance and total supply by fixed amount per block.
 */
contract CustomIncrementCoinage is AutoIncrementCoinage {
  event FactorSet(uint256 previous, uint256 current);

  constructor (
    string memory name,
    string memory symbol,
    uint256 factor,
    bool transfersEnabled
  )
    public
    AutoIncrementCoinage(name, symbol, factor, 0, transfersEnabled)
  {}

  /**
   * @dev set new factor for all users.
   */
  function setFactor(uint256 factor) external onlyOwner returns (bool) {
    uint256 previous = _factor;
    _factor = factor;
    emit FactorSet(previous, factor);
  }

////////////////////
// Getters
////////////////////
  function factor() public view returns (uint256) {
    return _factor;
  }

////////////////////
// Helpers
////////////////////
  function _calculateFactor(uint256 n) internal view returns (uint256) {
    return _factor;
  }
}