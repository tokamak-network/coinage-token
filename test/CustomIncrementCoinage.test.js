const range = require('lodash/range');

const {
  defaultSender, accounts, contract, web3,
} = require('@openzeppelin/test-environment');

const {
  BN, constants, expectEvent, expectRevert, time, ether,
} = require('@openzeppelin/test-helpers');

const { Currency, createCurrency, createCurrencyRatio } = require('@makerdao/currency');
const chai = require('chai');
const { expect } = chai;
chai.should();

const { ZERO_ADDRESS } = constants;

const { toBN } = web3.utils;

const CustomIncrementCoinageMock = contract.fromArtifact('CustomIncrementCoinageMock');

const CAG = createCurrency('CAG');
const CAG_UNIT = 'ray';

const e = new BN('100');

describe('CustomIncrementCoinage', function () {
  const factor = CAG('1.00');
  const initialSupply = CAG('10000');

  beforeEach(async function () {
    this.coinage = await deploy();
  });

  function deploy () {
    return CustomIncrementCoinageMock.new(
      'CustomIncrementCoinage Test',
      'CAT',
      factor.toFixed(CAG_UNIT),
      true,
    );
  }

  async function advanceRandomBlock (min, max = 0) {
    const n1 = (Math.floor(Math.random() * 20) + (min || 1));
    const n = max ? n1 % max + 1 : n1;

    await Promise.all(range(n).map(_ => time.advanceBlock()));
    return n;
  }
  function advanceBlocks (n) {
    return Promise.all(range(n).map(_ => time.advanceBlock()));
  }

  /**
   * @param {Promise} balanceProm
   * @param {CAG} expected
   */
  async function checkBalanceProm (balanceProm, expected) {
    return checkBalance(await balanceProm, expected);
  }

  function checkBalance (balanceBN, expected) {
    const balance = CAG(balanceBN, CAG_UNIT);
    toBN(balance.toFixed(CAG_UNIT)).sub(toBN(expected.toFixed(CAG_UNIT))).abs()
      .should.be.bignumber.lte(e);
  }

  describe('#factor', function () {
    const tokenOwner = accounts[0];
    const amount = initialSupply;
    const newFactor = factor.div(2);

    describe('when total supply is zero', function () {
      describe('when new factor is set to half of previous factor', function () {
        beforeEach(async function () {
          this.setReceipt = await this.coinage.setFactor(newFactor.toFixed(CAG_UNIT));
        });

        afterEach(function () {
          delete this.setReceipt;
        });

        it('should have correct new factor', async function () {
          expect(await this.coinage.factor()).to.be.bignumber.equal(newFactor.toFixed(CAG_UNIT));
        });

        it('should emit event', async function () {
          const { logs } = this.setReceipt;
          expectEvent.inLogs(logs, 'FactorSet', {
            previous: factor.toFixed(CAG_UNIT),
            current: newFactor.toFixed(CAG_UNIT),
          });
        });
      });
    });

    describe('when total supply is non-zero', function () {
      beforeEach(async function () {
        await advanceRandomBlock(4);
        await this.coinage.mint(tokenOwner, amount.toFixed(CAG_UNIT));
        await advanceRandomBlock(4);
      });

      describe('before new factor is set', function () {
        it('factor should not change', async function () {
          expect(await this.coinage.factor()).to.be.bignumber.equal(factor.toFixed(CAG_UNIT));
        });

        it('total supply should not change', async function () {
          expect(await this.coinage.totalSupply()).to.be.bignumber.equal(amount.toFixed(CAG_UNIT));
        });

        it('balance should not change', async function () {
          expect(await this.coinage.balanceOf(tokenOwner)).to.be.bignumber.equal(amount.toFixed(CAG_UNIT));
        });
      });

      describe('after new factor is set to half of previous factor', function () {
        beforeEach(async function () {
          await this.coinage.setFactor(newFactor.toFixed(CAG_UNIT));
        });

        it('factor should be half of the previous value', async function () {
          expect(await this.coinage.factor()).to.be.bignumber.equal(factor.div(2).toFixed(CAG_UNIT));
        });

        it('total supply should be half of the previous value', async function () {
          expect(await this.coinage.totalSupply()).to.be.bignumber.equal(amount.div(2).toFixed(CAG_UNIT));
        });

        it('balance should be half of the previous value', async function () {
          expect(await this.coinage.balanceOf(tokenOwner)).to.be.bignumber.equal(amount.div(2).toFixed(CAG_UNIT));
        });
      });
    });
  });
});
