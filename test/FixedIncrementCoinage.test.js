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

const FixedIncrementCoinageMock = contract.fromArtifact('FixedIncrementCoinageMock');

const CAG = createCurrency('CAG');
const CAG_UNIT = 'ray';

const e = new BN('100');

describe('FixedIncrementCoinage', function () {
  const factor = CAG('1.00');
  const seigPerBlock = CAG('100');

  const initialSupply = CAG('10000');

  beforeEach(async function () {
    this.coinage = await deploy();
  });

  function deploy () {
    return FixedIncrementCoinageMock.new(
      'FixedIncrementCoinage Test',
      'CAT',
      factor.toFixed(CAG_UNIT),
      seigPerBlock.toFixed(CAG_UNIT),
      true,
    );
  }

  // TODO: exponentiation by squaring?
  function fpow (v, n) {
    let f = factor;
    for (let i = 0; i < n; i++) {
      f = f.times(seigPerBlock);
    }
    return v.times(f);
  }

  async function advanceRandomBlock (min, max = 0) {
    const n1 = (Math.floor(Math.random() * 20) + (min || 1));
    const n = max ? n1 % max + 1 : n1;

    await Promise.all(range(n).map(_ => time.advanceBlock()));
    return n;
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
    // await time.advanceBlock();
    // toBN(balance.times(factorIncrement).toFixed(CAG_UNIT)).sub(toBN(expected.toFixed(CAG_UNIT))).abs()
    toBN(balance.toFixed(CAG_UNIT)).sub(toBN(expected.toFixed(CAG_UNIT))).abs()
      .should.be.bignumber.lte(e);
  }

  describe('#factor', function () {
    describe('when total supply is zero', function () {
      it('should not be change just after deployed', async function () {
        const expectedFactor = factor;
        expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed(CAG_UNIT));
      });
    });

    describe('when total supply is non-zero', function () {
      const tokenOwner = accounts[0];
      const amount = seigPerBlock.times(10); // 10% of seigniorage

      beforeEach(async function () {
        await this.coinage.mint(tokenOwner, amount.toFixed(CAG_UNIT));
      });

      function advanceBlocks (n) {
        return Promise.all(range(n).map(_ => time.advanceBlock()));
      }

      const r = range(1, 32);
      for (const i in r) {
        const n = r[i];
        describe(`when ${n} blocks are mined`, function () {
          it(`should increase factor by ${10 * n}% after ${n} blocks`, async function () {
            await advanceBlocks(n);

            const expectedFactor = factor.plus(factor.div(10).times(n));

            expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed(CAG_UNIT));
          });

          it(`should increase total supply by \`seigPerBlock * ${n}\` after ${n} blocks`, async function () {
            await advanceBlocks(n);

            const expectedTotalSupply = amount.plus(seigPerBlock.times(n));

            expect(await this.coinage.totalSupply()).to.be.bignumber.equal(expectedTotalSupply.toFixed(CAG_UNIT));
          });

          it(`should increase balance by seigPerBlock * ${n} after ${n} blocks`, async function () {
            await advanceBlocks(n);

            const expectedBalance = amount.plus(seigPerBlock.times(n));

            expect(await this.coinage.balanceOf(tokenOwner)).to.be.bignumber.equal(expectedBalance.toFixed(CAG_UNIT));
          });
        });
      }
    });
  });
});
