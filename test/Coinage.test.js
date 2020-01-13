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

const Coinage = contract.fromArtifact('CoinageMock');

const CAG = createCurrency('CAG');

const e = new BN('100');

describe('Coinage', function () {
  let factor;
  let factorIncrement;

  const initialSupply = CAG('10000');

  // 365 * 24 * 60 * 60 / 15 = 2102400 blocks
  // https://www.monkiapp.co/kr/%EB%B3%B5%EB%A6%AC-%EA%B3%84%EC%82%B0%EA%B8%B0
  // factorIncrement = CAG('1.00000008799');

  beforeEach(async function () {
    factor = CAG('1.00');
    factorIncrement = CAG('1.10');

    this.coinage = await deploy();
  });

  function deploy () {
    return Coinage.new(
      'Coinage Test',
      'CAT',
      factor.toFixed('ray'),
      factorIncrement.toFixed('ray'),
    );
  }

  // TODO: exponentiation by squaring?
  function fpow (v, n) {
    let f = factor;
    for (let i = 0; i < n; i++) {
      f = f.times(factorIncrement);
    }
    return v.times(f);
  }

  async function advanceRandomBlock (min) {
    const n = Math.floor(Math.random() * 20) + (min || 1);

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
    const balance = CAG(balanceBN, 'ray');
    // await time.advanceBlock();
    // toBN(balance.times(factorIncrement).toFixed('ray')).sub(toBN(expected.toFixed('ray'))).abs()
    toBN(balance.toFixed('ray')).sub(toBN(expected.toFixed('ray'))).abs()
      .should.be.bignumber.lte(e);
  }

  describe('#factor', function () {
    it('should not be change just after deployed', async function () {
      const expectedFactor = factor;
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });

    it('should increase exponentially by `factorIncrement^1` after 1 block', async function () {
      await time.advanceBlock();

      const expectedFactor = factor.times(factorIncrement);
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });

    it('should increase exponentially by `factorIncrement^2` after 2 block', async function () {
      await time.advanceBlock();
      await time.advanceBlock();

      const expectedFactor = factor.times(factorIncrement).times(factorIncrement);
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });

    it('should increase exponentially by `factorIncrement^4` after 4 block', async function () {
      await time.advanceBlock();
      await time.advanceBlock();
      await time.advanceBlock();
      await time.advanceBlock();

      const expectedFactor = factor.times(factorIncrement).times(factorIncrement)
        .times(factorIncrement).times(factorIncrement);

      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });

    // TODO: add test cases for total supply and balanceOf
    describe('balance and total supply', function () {
      const tokenOwner = accounts[0];
      const amount = CAG('1000');

      beforeEach(async function () {
        await this.coinage.mint(tokenOwner, amount.toFixed('ray'));
      });

      it('should mint amount of tokens', async function () {
        await checkBalanceProm(this.coinage.balanceOf(tokenOwner), amount);
      });

      it('balance should increase exponentially after n blocks', async function () {
        const n = await advanceRandomBlock(4);
        const expectedAmount = fpow(amount, n);
        await checkBalanceProm(this.coinage.balanceOf(tokenOwner), expectedAmount);
      });

      it('total supply should increase exponentially after n blocks', async function () {
        const totalSupply = CAG(await this.coinage.totalSupply(), 'ray');
        const n = await advanceRandomBlock(4);
        const expectedTotalSupply = fpow(totalSupply, n);
        await checkBalanceProm(this.coinage.totalSupply(), expectedTotalSupply);
      });
    });
  });

  describe('#ERC20', function () {
    const from = accounts[1];
    const to = accounts[2];

    beforeEach(async function () {
      await advanceRandomBlock();
      await this.coinage.mint(from, initialSupply.toFixed('ray'));
    });

    // shouldBehaveLikeERC20Transfer
    describe('#transfer', function () {
      describe('when the recipient is not the zero address', function () {
        describe('when the sender does not have enough balance', function () {
          it('reverts', async function () {
            const amount = CAG(await this.coinage.balanceOf(from), 'ray').times(CAG('2'));
            await expectRevert(this.coinage.transfer(to, amount.toFixed('ray'), { from }),
              'ERC20: transfer amount exceeds balance',
            );
          });
        });

        describe('when the sender transfers all balance', function () {
          it('transfers the requested amount', async function () {
            const amount = CAG(await this.coinage.balanceOf(from), 'ray');

            const fromBalance = CAG(await this.coinage.balanceOf(from), 'ray');
            const toBalance = CAG('0');

            const expectedFromBalance = fromBalance.times(factorIncrement).minus(amount);
            const expectedToBalance = toBalance.times(factorIncrement).plus(amount);

            await this.coinage.transfer(to, amount.toFixed('ray'), { from });

            await checkBalanceProm(this.coinage.balanceOf(from), expectedFromBalance);
            await checkBalanceProm(this.coinage.balanceOf(to), expectedToBalance);
          });

          it('emits a transfer event', async function () {
            const amount = CAG(await this.coinage.balanceOf(from), 'ray');

            const { logs } = await this.coinage.transfer(to, amount.toFixed('ray'), { from });

            // NOTE: use expectEvent.inLogs instead of expectEvent to capture returned event.
            const e = expectEvent.inLogs(logs, 'Transfer', {
              from,
              to,
            });

            checkBalance(e.args.value, amount);
          });
        });

        describe('when the sender transfers zero tokens', function () {
          const amount = CAG('0');

          it('transfers the requested amount', async function () {
            await this.coinage.mint(from, CAG('20').toFixed('ray'));
            await this.coinage.mint(to, CAG('20').toFixed('ray'));

            const expectedFromBalance = CAG(await this.coinage.balanceOf(from), 'ray').times(factorIncrement);
            const expectedToBalance = CAG(await this.coinage.balanceOf(to), 'ray').times(factorIncrement);

            await this.coinage.transfer(to, amount.toFixed('ray'), { from });

            await checkBalanceProm(this.coinage.balanceOf(from), expectedFromBalance);
            await checkBalanceProm(this.coinage.balanceOf(to), expectedToBalance);
          });

          it('emits a transfer event', async function () {
            const { logs } = await this.coinage.transfer(to, amount.toFixed('ray'), { from });

            // NOTE: use expectEvent.inLogs instead of expectEvent to capture returned event.
            const e = expectEvent.inLogs(logs, 'Transfer', {
              from,
              to,
            });

            checkBalance(e.args.value, amount);
          });
        });
      });

      describe('when the recipient is the zero address', function () {
        it('reverts', async function () {
          const fromBalance = CAG(await this.coinage.balanceOf(from), 'ray');
          await expectRevert(this.coinage.transfer(ZERO_ADDRESS, fromBalance.toFixed('ray'), { from }),
            'ERC20: transfer to the zero address',
          );
        });
      });

      //
    });

    describe('#transferFrom', function () {
      const spender = accounts[1];
      const tokenOwner = accounts[3];

      beforeEach(async function () {
        await this.coinage.mint(tokenOwner, initialSupply.toFixed('ray'));
      });

      describe('when the token owner is not the zero address', function () {
        describe('when the recipient is not the zero address', function () {
          const to = accounts[4];

          describe('when the spender has enough approved balance', function () {
            beforeEach(async function () {
              await this.coinage.approve(spender, initialSupply.toFixed('ray'), { from: tokenOwner });
            });

            describe('when the token owner has enough balance', function () {
              const amount = initialSupply;

              it('transfers the requested amount', async function () {
                const tokenOwnerBalance = CAG(await this.coinage.balanceOf(tokenOwner), 'ray');

                const expectedTokenOwnerBalance = tokenOwnerBalance.times(factorIncrement).minus(amount);
                const expectedToBalance = amount;

                await this.coinage.transferFrom(tokenOwner, to, amount.toFixed('ray'), { from: spender });

                await checkBalanceProm(this.coinage.balanceOf(tokenOwner), expectedTokenOwnerBalance);
                await checkBalanceProm(this.coinage.balanceOf(to), expectedToBalance);
              });

              it('decreases the spender allowance', async function () {
                await this.coinage.transferFrom(tokenOwner, to, amount.toFixed('ray'), { from: spender });

                expect(await this.coinage.allowance(tokenOwner, spender)).to.be.bignumber.equal('0');
              });

              it('emits a transfer event', async function () {
                const { logs } = await this.coinage.transferFrom(tokenOwner, to, amount.toFixed('ray'), { from: spender });

                // NOTE: use expectEvent.inLogs instead of expectEvent to capture returned event.
                const e = expectEvent.inLogs(logs, 'Transfer', {
                  from: tokenOwner,
                  to: to,
                });

                checkBalance(e.args.value, amount);
              });

              it('emits an approval event', async function () {
                const receipt = await this.coinage.transferFrom(tokenOwner, to, amount.toFixed('ray'), { from: spender });

                expectEvent(receipt, 'Approval', {
                  owner: tokenOwner,
                  spender: spender,
                  value: await this.coinage.allowance(tokenOwner, spender),
                });
              });
            });

            describe('when the token owner does not have enough balance', function () {
              const amount = initialSupply.times(CAG('2'));

              it('reverts', async function () {
                await expectRevert(this.coinage.transferFrom(
                  tokenOwner, to, amount.toFixed('ray'), { from: spender }), 'ERC20: transfer amount exceeds balance',
                );
              });
            });
          });

          describe('when the spender does not have enough approved balance', function () {
            beforeEach(async function () {
              await this.coinage.approve(spender, initialSupply.minus(CAG('1')).toFixed('ray'), { from: tokenOwner });
            });

            describe('when the token owner has enough balance', function () {
              const amount = initialSupply;

              it('reverts', async function () {
                await expectRevert(this.coinage.transferFrom(
                  tokenOwner, to, amount.toFixed('ray'), { from: spender }), 'ERC20: transfer amount exceeds allowance',
                );
              });
            });

            describe('when the token owner does not have enough balance', function () {
              const amount = initialSupply.times(CAG('2'));

              it('reverts', async function () {
                await expectRevert(this.coinage.transferFrom(
                  tokenOwner, to, amount.toFixed('ray'), { from: spender }), 'ERC20: transfer amount exceeds balance',
                );
              });
            });
          });
        });

        describe('when the recipient is the zero address', function () {
          const amount = initialSupply;
          const to = ZERO_ADDRESS;

          beforeEach(async function () {
            await this.coinage.approve(spender, amount.toFixed('ray'), { from: tokenOwner });
          });

          it('reverts', async function () {
            await expectRevert(this.coinage.transferFrom(
              tokenOwner, to, amount.toFixed('ray'), { from: spender }), 'ERC20: transfer to the zero address',
            );
          });
        });
      });
    });

    // shouldBehaveLikeERC20Approve
    describe('#approve', function () {
      const owner = accounts[1];
      const spender = accounts[2];

      describe('when the spender is not the zero address', function () {
        describe('when the sender has enough balance', function () {
          const amount = initialSupply;

          it('emits an approval event', async function () {
            const receipt = await this.coinage.approve(spender, amount.toFixed('ray'), { from: owner });

            expectEvent(receipt, 'Approval', {
              owner: owner,
              spender: spender,
              value: amount.toFixed('ray'),
            });
          });

          describe('when there was no approved amount before', function () {
            it('approves the requested amount', async function () {
              await this.coinage.approve(spender, amount.toFixed('ray'), { from: owner });

              expect(await this.coinage.allowance(owner, spender)).to.be.bignumber.equal(amount.toFixed('ray'));
            });
          });

          describe('when the spender had an approved amount', function () {
            beforeEach(async function () {
              await this.coinage.approve(spender, new BN(1), { from: owner });
            });

            it('approves the requested amount and replaces the previous one', async function () {
              await this.coinage.approve(spender, amount.toFixed('ray'), { from: owner });

              expect(await this.coinage.allowance(owner, spender)).to.be.bignumber.equal(amount.toFixed('ray'));
            });
          });
        });

        describe('when the sender does not have enough balance', function () {
          const amount = initialSupply.times(CAG('2'));

          it('emits an approval event', async function () {
            const receipt = await this.coinage.approve(spender, amount.toFixed('ray'), { from: owner });

            expectEvent(receipt, 'Approval', {
              owner: owner,
              spender: spender,
              value: amount.toFixed('ray'),
            });
          });

          describe('when there was no approved amount before', function () {
            it('approves the requested amount', async function () {
              await this.coinage.approve(spender, amount.toFixed('ray'), { from: owner });

              expect(await this.coinage.allowance(owner, spender)).to.be.bignumber.equal(amount.toFixed('ray'));
            });
          });

          describe('when the spender had an approved amount', function () {
            beforeEach(async function () {
              await this.coinage.approve(spender, new BN(1), { from: owner });
            });

            it('approves the requested amount and replaces the previous one', async function () {
              await this.coinage.approve(spender, amount.toFixed('ray'), { from: owner });

              expect(await this.coinage.allowance(owner, spender)).to.be.bignumber.equal(amount.toFixed('ray'));
            });
          });
        });
      });

      describe('when the spender is the zero address', function () {
        it('reverts', async function () {
          await expectRevert(this.coinage.approve(ZERO_ADDRESS, initialSupply.toFixed('ray'), { from: owner }),
            'ERC20: approve to the zero address',
          );
        });
      });
    });
  });
});
