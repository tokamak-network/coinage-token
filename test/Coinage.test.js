const {
  defaultSender, accounts, contract, web3,
} = require('@openzeppelin/test-environment');

const {
  BN, constants, expectEvent, expectRevert, time, ether,
} = require('@openzeppelin/test-helpers');

const { Currency, createCurrency, createCurrencyRatio } = require('@makerdao/currency');
const { expect } = require('chai');

const { ZERO_ADDRESS } = constants;

const { toBN } = web3.utils;

const Coinage = contract.fromArtifact('CoinageMock');

const CAG = createCurrency('CAG');

const e = ether('0.000000001');

describe('Coinage', function () {
  let factor;
  let factorIncrement;

  const initialSupply = CAG("10000");

  // 365 * 24 * 60 * 60 / 15 = 2102400 blocks
  // https://www.monkiapp.co/kr/%EB%B3%B5%EB%A6%AC-%EA%B3%84%EC%82%B0%EA%B8%B0
  // factorIncrement = CAG('1.00000008799');

  before(async function () {
    factor = CAG('1.00');
    factorIncrement = CAG('1.10');

    this.coinage = await Coinage.new(
      'Coinage Tesg',
      'CAT',
      factor.toFixed('ray'),
      factorIncrement.toFixed('ray'),
    );
  });

  describe('#factor', function () {
    it('should not be change just after deployed', async function () {
      const expectedFactor = factor;
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });

    it('should increase by `factorIncrement^1` after 1 block', async function () {
      await this.coinage.mint(accounts[0], 0);

      const expectedFactor = factor.times(factorIncrement);
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });

    it('should increase by `factorIncrement^2` after 2 block', async function () {
      await this.coinage.mint(accounts[0], 0);

      const expectedFactor = factor.times(factorIncrement).times(factorIncrement);
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });

    it('should increase by `factorIncrement^2` after 4 block', async function () {
      await time.advanceBlock();

      await this.coinage.mint(accounts[0], 0);

      const expectedFactor = factor.times(factorIncrement).times(factorIncrement)
        .times(factorIncrement).times(factorIncrement);

      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });
  });

  describe('#ERC20', function () {
        let from = accounts[1];
        let to = accounts[2];

    describe('#transfer', function () {
      describe('when the recipient is not the zero address', function () {

        describe('when the sender does not have enough balance', function () {
          const amount = initialSupply.times(CAG('2'));

          it('reverts', async function () {
            await expectRevert(this.coinage.transfer(to, amount.toFixed('wei'), { from }),
              `ERC20: transfer amount exceeds balance`
            );
          });

          // (await this.coinage.balanceOf(purchaser)).sub(toBN(_PTON1.toFixed('wei'))).abs()
          // .should.be.bignumber.lte(e);

        });

        describe('when the sender transfers all balance', function () {

          it('transfers the requested amount', async function () {
            const amount = CAG(await this.coinage.balanceOf(from));
            await this.coinage.transfer(to, amount.toFixed('wei'), { from });

            expect(await this.coinage.balanceOf(from)).to.be.bignumber.equal('0');
            expect(await this.coinage.balanceOf(to)).to.be.bignumber.equal(amount.toFixed('wei'));
            [from, to] = [to, from];
          });

          it('emits a transfer event', async function () {
            const amount = CAG(await this.coinage.balanceOf(from));
            
            const receipt = await this.coinage.transfer(to, amount.toFixed('wei'), { from });

            expectEvent(receipt, 'Transfer', {
              from,
              to,
              value: amount.toFixed('wei'),
            });
          });
        });

        describe('when the sender transfers zero tokens', function () {
          const amount = CAG('0');

          it('transfers the requested amount', async function () {
            const fromBalance = CAG(await this.coinage.balanceOf(from));
            const toBalance = CAG(await this.coinage.balanceOf(to));

            await this.coinage.transfer(to, amount.toFixed('wei'), { from });

            expect(await this.coinage.balanceOf(from)).to.be.bignumber.equal(fromBalance.toFixed('wei'));
            expect(await this.coinage.balanceOf(to)).to.be.bignumber.equal(toBalance.toFixed('wei'));
          });

          it('emits a transfer event', async function () {
            const receipt = await this.coinage.transfer(to, amount.toFixed('wei'), { from });

            expectEvent(receipt, 'Transfer', {
              from,
              to,
              value: amount.toFixed('wei'),
            });
          });
        });
      });

      describe('when the recipient is the zero address', function () {
        it('reverts', async function () {
            const fromBalance = CAG(await this.coinage.balanceOf(from));
          await expectRevert(this.coinage.transfer(ZERO_ADDRESS, fromBalance.toFixed('wei'), { from }),
            `ERC20: transfer to the zero address`
          );
        });
      });

    });
  });
});
