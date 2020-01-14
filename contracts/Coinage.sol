// based on ERC20 implementation of openzeppelin-solidity: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/7552af95e4ec6fccd64a95b206f59a1b4ff91517/contracts/token/ERC20/ERC20.sol
pragma solidity ^0.5.12;

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { Context } from "openzeppelin-solidity/contracts/GSN/Context.sol";
import { DSMath } from "./lib/DSMath.sol";

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { ERC20Detailed } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";



/**
 * @dev Implementation of coin age token based on ERC20 of openzeppelin-solidity
 *
 * Coinage stores `_totalSupply` and `_balances` as RAY BASED value,
 * `_allowances` as RAY FACTORED value.
 *
 * This takes public function (including _approve) parameters as RAY FACTORED value
 * and internal function (including approve) parameters as RAY BASED value, and emits event in RAY FACTORED value.
 *
 * `RAY BASED` = `RAY FACTORED`  / factor
 *
 *  factor increases exponentially for each block mined.
 */
contract Coinage is Context, IERC20, DSMath, Ownable, ERC20Detailed {
  using SafeMath for uint256;

  mapping (address => uint256) private _balances;

  mapping (address => mapping (address => uint256)) private _allowances;

  uint256 private _totalSupply;

  uint256 private _factor;

  uint256 private _factorIncrement;

  uint256 private _lastBlock;

  bool private _transfersEnabled;

  event FactorIncreased(uint256 factor);

  modifier increaseFactor() {
    uint256 n = block.number - _lastBlock;

    if (n > 0) {
      _factor = rmul(_factor, rpow(_factorIncrement, n));
      _lastBlock = block.number;

      emit FactorIncreased(_factor);
    }

    _;
  }

  modifier onlyTransfersEnabled() {
    require(msg.sender == owner() || _transfersEnabled, "Coinage: transfer not allowed");
    _;
  }

  constructor (
    string memory name,
    string memory symbol,
    uint256 factor,
    uint256 factorIncrement,
    bool transfersEnabled
  )
    public
    ERC20Detailed(name, symbol, 27)
  {
    _factor = factor;
    _factorIncrement = factorIncrement;
    _lastBlock = block.number;
    _transfersEnabled = transfersEnabled;
  }

  function factor() public view returns (uint256) {
    return _applyFactor(_factor);
  }

  function factorIncrement() public view returns (uint256) {
    return _factorIncrement;
  }

  function transfersEnabled() public returns (bool) {
    return _transfersEnabled;
  }

  function enableTransfers(bool v) public onlyOwner {
    _transfersEnabled = v;
  }

  /**
    * @dev See {IERC20-totalSupply}.
    */
  function totalSupply() public view returns (uint256) {
    // return _toRAYFactored(_totalSupply);
    return _applyFactor(_totalSupply);
  }


  /**
    * @dev See {IERC20-balanceOf}.
    */
  function balanceOf(address account) public view returns (uint256) {
    // return _toRAYFactored(_balances[account]);
    return _applyFactor(_balances[account]);
  }

  /**
    * @dev See {IERC20-transfer}.
    *
    * Requirements:
    *
    * - `recipient` cannot be the zero address.
    * - the caller must have a balance of at least `amount`.
    */
  function transfer(address recipient, uint256 amount) public onlyTransfersEnabled returns (bool) {
    _transfer(_msgSender(), recipient, amount);
    return true;
  }

  /**
    * @dev See {IERC20-allowance}.
    */
  function allowance(address owner, address spender) public view returns (uint256) {
    return _allowances[owner][spender];
  }

  /**
    * @dev See {IERC20-approve}.
    *
    * Requirements:
    *
    * - `spender` cannot be the zero address.
    */
  function approve(address spender, uint256 amount) public returns (bool) {
    _approve(_msgSender(), spender, amount);
    return true;
  }

  /**
    * @dev See {IERC20-transferFrom}.
    *
    * Emits an {Approval} event indicating the updated allowance. This is not
    * required by the EIP. See the note at the beginning of {ERC20};
    *
    * Requirements:
    * - `sender` and `recipient` cannot be the zero address.
    * - `sender` must have a balance of at least `amount`.
    * - the caller must have allowance for `sender`'s tokens of at least
    * `amount`.
    */
  function transferFrom(address sender, address recipient, uint256 amount) public onlyTransfersEnabled returns (bool) {
    _transfer(sender, recipient, amount);
    _approve(sender, _msgSender(), _allowances[sender][_msgSender()].sub(amount, "Coinage: transfer amount exceeds allowance"));
    return true;
  }

  /**
    * @dev Atomically increases the allowance granted to `spender` by the caller.
    *
    * This is an alternative to {approve} that can be used as a mitigation for
    * problems described in {IERC20-approve}.
    *
    * Emits an {Approval} event indicating the updated allowance.
    *
    * Requirements:
    *
    * - `spender` cannot be the zero address.
    */
  function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
    _approve(_msgSender(), spender, _allowances[_msgSender()][spender].add(addedValue));
    return true;
  }

  /**
    * @dev Atomically decreases the allowance granted to `spender` by the caller.
    *
    * This is an alternative to {approve} that can be used as a mitigation for
    * problems described in {IERC20-approve}.
    *
    * Emits an {Approval} event indicating the updated allowance.
    *
    * Requirements:
    *
    * - `spender` cannot be the zero address.
    * - `spender` must have allowance for the caller of at least
    * `subtractedValue`.
    */
  function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
    _approve(_msgSender(), spender, _allowances[_msgSender()][spender].sub(subtractedValue, "Coinage: decreased allowance below zero"));
    return true;
  }

  /**
    * @dev Moves tokens `amount` from `sender` to `recipient`.
    *
    * This is internal function is equivalent to {transfer}, and can be used to
    * e.g. implement automatic token fees, slashing mechanisms, etc.
    *
    * Emits a {Transfer} event.
    *
    * Requirements:
    *
    * - `sender` cannot be the zero address.
    * - `recipient` cannot be the zero address.
    * - `sender` must have a balance of at least `amount`.
    */
  function _transfer(address sender, address recipient, uint256 amount) internal increaseFactor {
    require(sender != address(0), "Coinage: transfer from the zero address");
    require(recipient != address(0), "Coinage: transfer to the zero address");

    uint256 rbAmount = _toRAYBased(amount);

    _balances[sender] = _balances[sender].sub(rbAmount, "Coinage: transfer amount exceeds balance");
    _balances[recipient] = _balances[recipient].add(rbAmount);
    emit Transfer(sender, recipient, _toRAYFactored(rbAmount));
  }

  /** @dev Creates `amount` tokens and assigns them to `account`, increasing
    * the total supply.
    *
    * Emits a {Transfer} event with `from` set to the zero address.
    *
    * Requirements
    *
    * - `to` cannot be the zero address.
    */
  function _mint(address account, uint256 amount) internal increaseFactor {
    require(account != address(0), "Coinage: mint to the zero address");

    uint256 rbAmount = _toRAYBased(amount);

    _totalSupply = _totalSupply.add(rbAmount);
    _balances[account] = _balances[account].add(rbAmount);
    emit Transfer(address(0), account, _toRAYFactored(rbAmount));
  }

    /**
    * @dev Destroys `amount` tokens from `account`, reducing the
    * total supply.
    *
    * Emits a {Transfer} event with `to` set to the zero address.
    *
    * Requirements
    *
    * - `account` cannot be the zero address.
    * - `account` must have at least `amount` tokens.
    */
  function _burn(address account, uint256 amount) internal increaseFactor {
    require(account != address(0), "Coinage: burn from the zero address");

    uint256 rbAmount = _toRAYBased(amount);

    _balances[account] = _balances[account].sub(rbAmount, "Coinage: burn amount exceeds balance");
    _totalSupply = _totalSupply.sub(rbAmount);
    emit Transfer(account, address(0), _toRAYFactored(rbAmount));
  }

  /**
    * @dev Sets `amount` as the allowance of `spender` over the `owner`s tokens.
    *
    * This is internal function is equivalent to `approve`, and can be used to
    * e.g. set automatic allowances for certain subsystems, etc.
    *
    * Emits an {Approval} event.
    *
    * Requirements:
    *
    * - `owner` cannot be the zero address.
    * - `spender` cannot be the zero address.
    */
  function _approve(address owner, address spender, uint256 amount) internal increaseFactor {
    require(owner != address(0), "Coinage: approve from the zero address");
    require(spender != address(0), "Coinage: approve to the zero address");

    _allowances[owner][spender] = amount;
    emit Approval(owner, spender, amount);
  }

  /**
    * @dev Destroys `rbAmount` tokens from `account`.`rbAmount` is then deducted
    * from the caller's allowance.
    *
    * See {_burn} and {_approve}.
    */
  function _burnFrom(address account, uint256 amount) internal increaseFactor {
    _burn(account, amount);
    _approve(account, _msgSender(), _allowances[account][_msgSender()].sub(amount, "Coinage: burn amount exceeds allowance"));
  }

  // helpers
  /**
   * @dev Calculate RAY BASED from RAY FACTORED
   */
  function _toRAYBased(uint256 rf) internal view returns (uint256 rb) {
    return rdiv(rf, _factor);
  }

  /**
   * @dev Calculate RAY FACTORED from RAY BASED
   */
  function _toRAYFactored(uint256 rb) internal view returns (uint256 rf) {
    return rmul(rb, _factor);
  }

  function _applyFactor(uint256 r) internal view returns (uint256) {
    uint256 n = block.number - _lastBlock;

    if (n == 0) {
      return rmul(r, _factor);
    }

    return rmul(r, rmul(_factor, rpow(_factorIncrement, n)));
  }
}
