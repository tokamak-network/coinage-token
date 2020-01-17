pragma solidity ^0.5.12;

import { AutoIncrementCoinage } from "./AutoIncrementCoinage.sol";


/**
 * @dev FixedIncrementCoinage increases balance and total supply by fixed amount per block.
 */
contract FixedIncrementCoinage is AutoIncrementCoinage {
  uint256 internal _seigPerBlock;

  constructor (
    string memory name,
    string memory symbol,
    uint256 factor,
    uint256 seigPerBlock,
    bool transfersEnabled
  )
    public
    AutoIncrementCoinage(name, symbol, factor, 0, transfersEnabled)
  {
    require(seigPerBlock != 0, "FixedIncrementCoinage: seignorage must not be zero");
    _seigPerBlock = seigPerBlock;
  }

////////////////////
// Getters
////////////////////

  function seigPerBlock() public view returns (uint256) {
    return _seigPerBlock;
  }

////////////////////
// Helpers
////////////////////

  /**
   * @dev Returns new factor for fixed increment per block.
   */
  function _calculateFactor(uint256 n) internal view returns (uint256) {
    if (_totalSupply == 0) return _factor;

    uint256 prevTotalSupply = rmul(_totalSupply, _factor);
    uint256 nextTotalSupply = add(prevTotalSupply, mul(_seigPerBlock, n));

    return rdiv(rmul(_factor, nextTotalSupply), prevTotalSupply);
  }
}