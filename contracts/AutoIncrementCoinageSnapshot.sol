// based on MiniMeToken implementation of giveth: https://github.com/Giveth/minime/blob/ea04d95/contracts/MiniMeToken.sol
pragma solidity ^0.5.12;

/*
  Copyright 2016, Jordi Baylina

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/// @title AutoIncrementCoinageSnapshot Contract
/// @author Jordi Baylina
/// @dev This token contract's goal is to make it easy for anyone to clone this
///  token using the token distribution at a given block, this will allow DAO's
///  and DApps to upgrade their features in a decentralized manner without
///  affecting the original token
/// @dev It is ERC20 compliant, but still needs to under go further testing.

import { DSMath } from "./lib/DSMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

import "./lib/minime/Controlled.sol";
import "./lib/minime/TokenController.sol";


contract ApproveAndCallFallBack {
  function receiveApproval(address from, uint256 _amount, address _token, bytes memory _data) public;
}

/// @dev The actual token contract, the default controller is the msg.sender
///  that deploys the contract, so usually this token will be deployed by a
///  token controller contract, which Giveth will call a "Campaign"
contract AutoIncrementCoinageSnapshot is IERC20, DSMath, Controlled {

  uint public constant defaultFactor = 10 ** 18;
  uint8 public constant decimals = 18;        // Number of decimals of the smallest unit
  string public name;                         // The Token's name: e.g. DigixDAO Tokens
  string public symbol;                       // An identifier: e.g. REP
  string public version = 'C_MMT_0.1';        // An arbitrary versioning scheme


  /// @dev `Checkpoint` is the structure that attaches a block number to a
  ///  given value, the block number attached is the one that last changed the
  ///  value
  struct  Checkpoint {

    // `fromBlock` is the block number that the value was generated from
    uint128 fromBlock;

    // `value` is the amount of tokens at a specific block number
    uint128 value;
  }

  // `parentToken` is the Token address that was cloned to produce this token;
  //  it will be 0x0 for a token that was not cloned
  AutoIncrementCoinageSnapshot public parentToken;

  // `parentSnapShotBlock` is the block number from the Parent Token that was
  //  used to determine the initial distribution of the Clone Token
  uint public parentSnapShotBlock;

  // `creationBlock` is the block number that the Clone Token was created
  uint public creationBlock;

  // `balances` is the map that tracks the balance of each address, in this
  //  contract when the balance changes the block number that the change
  //  occurred is also included in the map
  mapping (address => Checkpoint[]) balances;

  // `allowed` tracks any extra transfer rights as in all ERC20 tokens
  mapping (address => mapping (address => uint256)) allowed;

  // Tracks the history of the `totalSupply` of the token
  Checkpoint[] totalSupplyHistory;

  // Flag that determines if the token is transferable or not.
  bool public transfersEnabled;

  // The factory used to create new clone tokens
  AutoIncrementCoinageSnapshotFactory public tokenFactory;

  Checkpoint[] factorHistory;

  uint256 public factorIncrement;


////////////////
// Constructor
////////////////

  /// @notice Constructor to create a AutoIncrementCoinageSnapshot
  /// @param _tokenFactory The address of the AutoIncrementCoinageSnapshotFactory contract that
  ///  will create the Clone token contracts, the token factory needs to be
  ///  deployed first
  /// @param _parentToken Address of the parent token, set to 0x0 if it is a
  ///  new token
  /// @param _parentSnapShotBlock Block of the parent token that will
  ///  determine the initial distribution of the clone token, set to 0 if it
  ///  is a new token
  /// @param _tokenName Name of the new token
  /// @param _tokenSymbol Token Symbol for the new token
  /// @param _transfersEnabled If true, tokens will be able to be transferred
  constructor (
    address payable _tokenFactory,
    address payable _parentToken,
    uint _parentSnapShotBlock,
    string memory _tokenName,
    string memory _tokenSymbol,
    uint _factor,
    uint _factorIncrement,
    bool _transfersEnabled
  ) public {
    tokenFactory = AutoIncrementCoinageSnapshotFactory(_tokenFactory);
    name = _tokenName;                  // Set the name
    symbol = _tokenSymbol;              // Set the symbol
    parentToken = AutoIncrementCoinageSnapshot(_parentToken);
    parentSnapShotBlock = _parentSnapShotBlock;
    factorIncrement = _factorIncrement;
    transfersEnabled = _transfersEnabled;
    creationBlock = block.number;

    uint factor = _factor;

    if (isContract(address(parentToken))) {
      factor = parentToken.factorAt(parentSnapShotBlock);
    }

    factorHistory.push(Checkpoint({
      fromBlock: uint128(block.number),
      value: uint128(factor == 0 ? defaultFactor : factor)
    }));
  }


///////////////////
// ERC20 Methods
///////////////////

  /// @notice Send `_amount` tokens to `_to` from `msg.sender`
  /// @param _to The address of the recipient
  /// @param _amount The amount of tokens to be transferred
  /// @return Whether the transfer was successful or not
  function transfer(address _to, uint256 _amount) public returns (bool success) {
    require(transfersEnabled);
    doTransfer(msg.sender, _to, _amount);
    return true;
  }

  /// @notice Send `_amount` tokens to `_to` from `_from` on the condition it
  ///  is approved by `_from`
  /// @param _from The address holding the tokens being transferred
  /// @param _to The address of the recipient
  /// @param _amount The amount of tokens to be transferred
  /// @return True if the transfer was successful
  function transferFrom(address _from, address _to, uint256 _amount) public returns (bool success) {

    // The controller of this contract can move tokens around at will,
    //  this is important to recognize! Confirm that you trust the
    //  controller of this contract, which in most situations should be
    //  another open source smart contract or 0x0
    if (msg.sender != controller) {
      require(transfersEnabled);

      // The standard ERC 20 transferFrom functionality
      require(allowed[_from][msg.sender] >= _amount, "AutoIncrementCoinageSnapshot: transfer amount exceeds allowance");
      allowed[_from][msg.sender] -= _amount;
      emit Approval(_from, msg.sender, allowed[_from][msg.sender]);
    }
    doTransfer(_from, _to, _amount);
    return true;
  }

  /// @dev This is the actual transfer function in the token contract, it can
  ///  only be called by other functions in this contract.
  /// @param _from The address holding the tokens being transferred
  /// @param _to The address of the recipient
  /// @param _amount The amount of tokens in WAD FACTORED to be transferred
  /// @return True if the transfer was successful
  function doTransfer(address _from, address _to, uint _amount) internal increaseFactor {

       if (_amount == 0) {
         emit Transfer(_from, _to, _amount);  // Follow the spec to louch the event when transfer 0
         return;
       }

       require(parentSnapShotBlock < block.number, "T?");

       // Do not allow transfer to 0x0 or the token contract itself
       require(_to != address(0), "AutoIncrementCoinageSnapshot: transfer to the zero address");
       require(_to != address(this), "AutoIncrementCoinageSnapshot: transfer to the token");

       // If the amount being transfered is more than the balance of the
       //  account the transfer throws
       uint previousBalanceFrom = basedBalanceOfAt(_from, block.number);
       uint wbAmount = _toWADBased(_amount, block.number);

       require(previousBalanceFrom >= wbAmount, "AutoIncrementCoinageSnapshot: transfer amount exceeds balance");
       // Alerts the token controller of the transfer
       if (isContract(controller)) {
         require(TokenController(controller).onTransfer(_from, _to, _toWADFactored(wbAmount, block.number)));
       }

       // First update the balance array with the new value for the address
       //  sending the tokens
       updateValueAtNow(balances[_from], previousBalanceFrom - wbAmount);

       // Then update the balance array with the new value for the address
       //  receiving the tokens
       uint previousBalanceTo = basedBalanceOfAt(_to, block.number);
       require(uint128(previousBalanceTo + wbAmount) >= previousBalanceTo); // Check for overflow
       updateValueAtNow(balances[_to], previousBalanceTo + wbAmount);

       // An event to make the transfer easy to find on the blockchain
       emit Transfer(_from, _to, _toWADFactored(wbAmount, block.number));

  }

  /// @param _owner The address that's balance is being requested
  /// @return The balance of `_owner` at the current block
  function balanceOf(address _owner) public view returns (uint256 balance) {
    return balanceOfAt(_owner, block.number);
  }

  /// @notice `msg.sender` approves `_spender` to spend `_amount` tokens on
  ///  its behalf. This is a modified version of the ERC20 approve function
  ///  to be a little bit safer
  /// @param _spender The address of the account able to transfer the tokens
  /// @param _amount The amount of tokens to be approved for transfer
  /// @return True if the approval was successful
  function approve(address _spender, uint256 _amount) public returns (bool success) {
    require(transfersEnabled);

    // To change the approve amount you first have to reduce the addresses`
    //  allowance to zero by calling `approve(_spender,0)` if it is not
    //  already 0 to mitigate the race condition described here:
    //  https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
    require((_amount == 0) || (allowed[msg.sender][_spender] == 0), "AutoIncrementCoinageSnapshot: invalid approve amount");

    // Alerts the token controller of the approve function call
    if (isContract(controller)) {
      require(TokenController(controller).onApprove(msg.sender, _spender, _amount));
    }

    allowed[msg.sender][_spender] = _amount;
    emit Approval(msg.sender, _spender, _amount);
    return true;
  }

  /// @dev This function makes it easy to read the `allowed[]` map
  /// @param _owner The address of the account that owns the token
  /// @param _spender The address of the account able to transfer the tokens
  /// @return Amount of remaining tokens of _owner that _spender is allowed
  ///  to spend
  function allowance(address _owner, address _spender) public view returns (uint256 remaining) {
    return allowed[_owner][_spender];
  }

  /// @notice `msg.sender` approves `_spender` to send `_amount` tokens on
  ///  its behalf, and then a function is triggered in the contract that is
  ///  being approved, `_spender`. This allows users to use their tokens to
  ///  interact with contracts in one function call instead of two
  /// @param _spender The address of the contract able to transfer the tokens
  /// @param _amount The amount of tokens to be approved for transfer
  /// @return True if the function call was successful
  function approveAndCall(address _spender, uint256 _amount, bytes memory _extraData) public returns (bool success) {
    require(approve(_spender, _amount));

    ApproveAndCallFallBack(_spender).receiveApproval(
      msg.sender,
      _amount,
      address(this),
      _extraData
    );

    return true;
  }

  /// @dev This function makes it easy to get the total number of tokens
  /// @return The total number of tokens
  function totalSupply() public view returns (uint) {
    return totalSupplyAt(block.number);
  }

  /// @dev This function makes it easy to get factor
  /// @return The factor
  function factor() public view returns (uint) {
    return factorAt(block.number);
  }


////////////////
// Query balance and totalSupply in History
////////////////

  /// @dev Queries the balance of `_owner` at a specific `_blockNumber`
  /// @param _owner The address from which the balance will be retrieved
  /// @param _blockNumber The block number when the balance is queried
  /// @return The balance at `_blockNumber` in WAS FACTORED
  function balanceOfAt(address _owner, uint _blockNumber) public view returns (uint) {
    return _applyFactorAt(basedBalanceOfAt(_owner, _blockNumber), _blockNumber);
  }

  /// @dev Queries the balance of `_owner` at a specific `_blockNumber` in WAD BASED
  /// @param _owner The address from which the balance will be retrieved
  /// @param _blockNumber The block number when the balance is queried
  /// @return The balance at `_blockNumber` in WAD BASED
  function basedBalanceOfAt(address _owner, uint _blockNumber) public view returns (uint) {
    // These next few lines are used when the balance of the token is
    //  requested before a check point was ever created for this token, it
    //  requires that the `parentToken.balanceOfAt` be queried at the
    //  genesis block for that token as this contains initial balance of
    //  this token
    if ((balances[_owner].length == 0)
      || (balances[_owner][0].fromBlock > _blockNumber)) {
      if (address(parentToken) != address(0)) {
        uint bn = min(_blockNumber, parentSnapShotBlock);
        return _toWADBased(parentToken.balanceOfAt(_owner, bn), bn);
      } else {
        // Has no parent
        return 0;
      }

    // This will return the expected balance during normal situations
    } else {
      return getValueAt(balances[_owner], _blockNumber);
    }
  }

  /// @notice Total amount of tokens at a specific `_blockNumber`.
  /// @param _blockNumber The block number when the totalSupply is queried
  /// @return The total amount of tokens at `_blockNumber` in WAS FACTORED
  function totalSupplyAt(uint _blockNumber) public view returns (uint) {
    return _applyFactorAt(basedTotalSupplyAt(_blockNumber), _blockNumber);
  }

  /// @notice Total amount of tokens at a specific `_blockNumber`.
  /// @param _blockNumber The block number when the totalSupply is queried
  /// @return The total amount of tokens at `_blockNumber` in WAS BASED
  function basedTotalSupplyAt(uint _blockNumber) public view returns (uint) {

    // These next few lines are used when the totalSupply of the token is
    //  requested before a check point was ever created for this token, it
    //  requires that the `parentToken.totalSupplyAt` be queried at the
    //  genesis block for this token as that contains totalSupply of this
    //  token at this block number.
    if ((totalSupplyHistory.length == 0)
      || (totalSupplyHistory[0].fromBlock > _blockNumber)) {
      if (address(parentToken) != address(0)) {
        uint bn = min(_blockNumber, parentSnapShotBlock);
        return _toWADBased(parentToken.totalSupplyAt(bn), bn);
      } else {
        return 0;
      }

    // This will return the expected totalSupply during normal situations
    } else {
      return getValueAt(totalSupplyHistory, _blockNumber);
    }
  }

  /// @notice Factor at a specific `_blockNumber`.
  /// @param _blockNumber The block number when the factor is queried
  /// @return The factor value at `_blockNumber`
  function factorAt(uint _blockNumber) public view returns(uint) {

    if (factorHistory[0].fromBlock > _blockNumber) {
      return wdiv(
        factorHistory[0].value,
        wpow(factorIncrement, uint256(factorHistory[0].fromBlock - _blockNumber))
      );

    // This will return the expected totalSupply during normal situations
    } else {
      (uint f, uint b) = getValueAtWithBlcokNumber(factorHistory, _blockNumber);
      return wmul(f, wpow(factorIncrement, sub(_blockNumber, b)));
    }
  }

////////////////
// Clone Token Method
////////////////

    function createCloneToken(
      string memory _cloneTokenName,
      string memory _cloneTokenSymbol,
      uint _factor,
      uint _factorIncrement,
      uint _snapshotBlock,
      bool _transfersEnabled
    ) public returns(address) {
      if (_snapshotBlock == 0) _snapshotBlock = block.number;

      AutoIncrementCoinageSnapshot cloneToken = tokenFactory.createCloneToken(
        address(uint160(address(this))),
        _snapshotBlock,
        _cloneTokenName,
        _cloneTokenSymbol,
        _factor,
        _factorIncrement,
        _transfersEnabled
      );

      cloneToken.changeController(msg.sender);

      // An event to make the token easy to find on the blockchain
      emit NewCloneToken(address(cloneToken), _snapshotBlock);
      return address(cloneToken);
    }

////////////////
// Generate and destroy tokens
////////////////

  /// @notice Generates `_amount` tokens that are assigned to `_owner`
  /// @param _owner The address that will be assigned the new tokens
  /// @param _amount The quantity of tokens generated
  /// @return True if the tokens are generated correctly
  function generateTokens(address _owner, uint _amount)
    public
    onlyController
    increaseFactor
    returns (bool)
  {
    uint wbAmount = _toWADBased(_amount, block.number);
    uint curTotalSupply = basedTotalSupplyAt(block.number);
    require(uint128(curTotalSupply + wbAmount) >= curTotalSupply); // Check for overflow
    uint previousBalanceTo = basedBalanceOfAt(_owner, block.number);
    require(uint128(previousBalanceTo + wbAmount) >= previousBalanceTo); // Check for overflow
    updateValueAtNow(totalSupplyHistory, curTotalSupply + wbAmount);
    updateValueAtNow(balances[_owner], previousBalanceTo + wbAmount);
    emit Transfer(address(0), _owner, _toWADFactored(wbAmount, block.number));
    return true;
  }


  /// @notice Burns `_amount` tokens from `_owner`
  /// @param _owner The address that will lose the tokens
  /// @param _amount The quantity of tokens to burn
  /// @return True if the tokens are burned correctly
  function destroyTokens(address _owner, uint _amount)
    onlyController
    increaseFactor
    public
    returns (bool)
  {
    uint wbAmount = _toWADBased(_amount, block.number);
    uint curTotalSupply = basedTotalSupplyAt(block.number);
    require(curTotalSupply >= wbAmount);
    uint previousBalanceFrom = basedBalanceOfAt(_owner, block.number);
    require(previousBalanceFrom >= wbAmount);
    updateValueAtNow(totalSupplyHistory, curTotalSupply - wbAmount);
    updateValueAtNow(balances[_owner], previousBalanceFrom - wbAmount);
    emit Transfer(_owner, address(0), _toWADFactored(wbAmount, block.number));
    return true;
  }

////////////////
// Enable tokens transfers
////////////////


  /// @notice Enables token holders to transfer their tokens freely if true
  /// @param _transfersEnabled True if transfers are allowed in the clone
  function enableTransfers(bool _transfersEnabled) public onlyController {
    transfersEnabled = _transfersEnabled;
  }

////////////////
// Internal helper functions to query and set a value in a snapshot array
////////////////

  /// @dev `getValueAt` retrieves the number of tokens at a given block number
  /// @param checkpoints The history of values being queried
  /// @param _block The block number to retrieve the value at
  /// @return The number of tokens being queried
  function getValueAt(Checkpoint[] storage checkpoints, uint _block) view internal returns (uint) {
    (uint v, uint _) = getValueAtWithBlcokNumber(checkpoints, _block);
    return v;
  }

  /// @dev `getValueAt` retrieves the number of tokens at a given block number
  /// @param checkpoints The history of values being queried
  /// @param _block The block number to retrieve the value at
  /// @return The number of tokens being queried
  function getValueAtWithBlcokNumber(Checkpoint[] storage checkpoints, uint _block) view internal returns (uint, uint) {
    if (checkpoints.length == 0) return (0, 0);

    // Shortcut for the actual value
    if (_block >= checkpoints[checkpoints.length-1].fromBlock)
      return (checkpoints[checkpoints.length-1].value, checkpoints[checkpoints.length-1].fromBlock);
    if (_block < checkpoints[0].fromBlock) return (0, checkpoints[0].fromBlock);

    // Binary search of the value in the array
    uint min = 0;
    uint max = checkpoints.length-1;
    while (max > min) {
      uint mid = (max + min + 1)/ 2;
      if (checkpoints[mid].fromBlock<=_block) {
        min = mid;
      } else {
        max = mid-1;
      }
    }
    return (checkpoints[min].value, checkpoints[min].fromBlock);
  }

  /// @dev `updateValueAtNow` used to update the `balances` map and the
  ///  `totalSupplyHistory`
  /// @param checkpoints The history of data being updated
  /// @param _value The new number of tokens
  function updateValueAtNow(Checkpoint[] storage checkpoints, uint _value) internal  {
    require(_value == uint(uint128(_value)));
    if ((checkpoints.length == 0)
    || (checkpoints[checkpoints.length -1].fromBlock < block.number)) {
         Checkpoint storage newCheckPoint = checkpoints[ checkpoints.length++ ];
         newCheckPoint.fromBlock =  uint128(block.number);
         newCheckPoint.value = uint128(_value);
       } else {
         Checkpoint storage oldCheckPoint = checkpoints[checkpoints.length-1];
         oldCheckPoint.value = uint128(_value);
       }
  }

  /// @dev Internal function to determine if an address is a contract
  /// @param _addr The address being queried
  /// @return True if `_addr` is a contract
  function isContract(address _addr) view internal returns(bool) {
    uint size;
    if (_addr == address(0)) return false;
    assembly {
      size := extcodesize(_addr)
    }
    return size>0;
  }

  /// @dev Helper function to return a min betwen the two uints
  function min(uint a, uint b) pure internal returns (uint) {
    return a < b ? a : b;
  }

  /// @notice The fallback function: If the contract's controller has not been
  ///  set to 0, then the `proxyPayment` method is called which relays the
  ///  ether and creates tokens as described in the token controller contract
  function () external payable {
    require(isContract(controller));
    require(TokenController(controller).proxyPayment.value(msg.value)(msg.sender));
  }

//////////
// Safety Methods
//////////

  /// @notice This method can be used by the controller to extract mistakenly
  ///  sent tokens to this contract.
  /// @param _token The address of the token contract that you want to recover
  ///  set to 0 in case you want to extract ether.
  function claimTokens(address payable _token) public onlyController {
    if (_token == address(0)) {
      controller.transfer(address(this).balance);
      return;
    }

    AutoIncrementCoinageSnapshot token = AutoIncrementCoinageSnapshot(_token);
    uint balance = token.balanceOf(address(this));
    token.transfer(controller, balance);
    emit ClaimedTokens(_token, controller, balance);
  }

////////////////
// Internal helper functions for factor computation
////////////////
  /**
   * @dev Calculate WAD BASED from WAD FACTORED
   */
  function _toWADBased(uint256 wf, uint256 blockNumber) internal view returns (uint256 wb) {
    return wdiv(wf, factorAt(blockNumber));
  }

  /**
   * @dev Calculate WAD FACTORED from WAD BASED
   */
  function _toWADFactored(uint256 wb, uint256 blockNumber) internal view returns (uint256 wf) {
    return wmul(wb, factorAt(blockNumber));
  }

  /**
   * @param v the value to be factored
   */
  function _applyFactor(uint256 v) internal view returns (uint256) {
    return _applyFactorAt(v, block.number);
  }

  /**
   * @dev apply factor to {v} at a specific block
   */
  function _applyFactorAt(uint256 v, uint256 blockNumber) internal view returns (uint256) {
    return wmul(v, factorAt(blockNumber));
  }

////////////////
// Modifiers
////////////////
  modifier increaseFactor() {
    Checkpoint storage fh = factorHistory[factorHistory.length - 1];
    uint256 f = fh.value;
    uint256 n = block.number - fh.fromBlock;

    if (n > 0) {
      f = wmul(f, wpow(factorIncrement, n));

      updateValueAtNow(factorHistory, f);

      emit FactorIncreased(f);
    }

    _;
  }

////////////////
// Events
////////////////
  event ClaimedTokens(address indexed token, address indexed controller, uint value);
  event Transfer(address indexed from, address indexed to, uint256 value);
  event NewCloneToken(address indexed cloneToken, uint snapshotBlock);
  event Approval(address indexed owner, address indexed spender, uint256 value);

  event FactorIncreased(uint256 factor);
}


////////////////
// AutoIncrementCoinageSnapshotFactory
////////////////

/// @dev This contract is used to generate clone contracts from a contract.
///  In solidity this is the way to create a contract from a contract of the
///  same class
contract AutoIncrementCoinageSnapshotFactory {

  /// @notice Update the DApp by creating a new token with new functionalities
  ///  the msg.sender becomes the controller of this clone token
  /// @param _parentToken Address of the token being cloned
  /// @param _snapshotBlock Block of the parent token that will
  ///  determine the initial distribution of the clone token
  /// @param _tokenName Name of the new token
  /// @param _tokenSymbol Token Symbol for the new token
  /// @param _transfersEnabled If true, tokens will be able to be transferred
  /// @return The address of the new token contract
  function createCloneToken(
    address payable _parentToken,
    uint _snapshotBlock,
    string memory _tokenName,
    string memory _tokenSymbol,
    uint _factor,
    uint _factorIncrement,
    bool _transfersEnabled
  ) public returns (AutoIncrementCoinageSnapshot) {
    AutoIncrementCoinageSnapshot newToken = new AutoIncrementCoinageSnapshot(
      address(uint160(address(this))),
      _parentToken,
      _snapshotBlock,
      _tokenName,
      _tokenSymbol,
      _factor,
      _factorIncrement,
      _transfersEnabled
      );

    newToken.changeController(msg.sender);
    return newToken;
  }
}