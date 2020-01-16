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

const Coinage = contract.fromArtifact('AutoIncrementCoinageSnapshot');
const Factory = contract.fromArtifact('AutoIncrementCoinageSnapshotFactory');

const CAG = createCurrency('CAG');
const CAG_UNIT = 'wei';

const e = new BN('15000');

// TODO: add minimi snapshot test case
describe('AutoIncrementCoinageSnapshot', function () {
  let factor;
  let factorIncrement;

  const initialSupply = CAG('10000');

  // 365 * 24 * 60 * 60 / 15 = 2102400 blocks
  // https://www.monkiapp.co/kr/%EB%B3%B5%EB%A6%AC-%EA%B3%84%EC%82%B0%EA%B8%B0
  // factorIncrement = CAG('1.00000008799');

  beforeEach(async function () {
    factor = CAG('1.00');
    factorIncrement = CAG('1.10');

    const { factory, coinage } = await deploy();
    this.factory = factory;
    this.coinage = coinage;
  });

  async function deploy () {
    const factory = await Factory.new();
    const coinage = await Coinage.new(
      factory.address,
      ZERO_ADDRESS,
      0,
      'AutoIncrementCoinageSnapshot Test',
      'CAST',
      factor.toFixed(CAG_UNIT),
      factorIncrement.toFixed(CAG_UNIT),
      true,
    );

    return { factory, coinage };
  }

  // TODO: exponentiation by squaring?
  function fpow (v, n) {
    let f = factor;
    for (let i = 0; i < n; i++) {
      f = f.times(factorIncrement);
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
    it('should not be change just after deployed', async function () {
      const expectedFactor = factor;
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed(CAG_UNIT));
    });

    it('should increase exponentially by `factorIncrement^1` after 1 block', async function () {
      await time.advanceBlock();

      const expectedFactor = factor.times(factorIncrement);
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed(CAG_UNIT));
    });

    it('should increase exponentially by `factorIncrement^2` after 2 block', async function () {
      await time.advanceBlock();
      await time.advanceBlock();

      const expectedFactor = factor.times(factorIncrement).times(factorIncrement);
      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed(CAG_UNIT));
    });

    it('should increase exponentially by `factorIncrement^4` after 4 block', async function () {
      await time.advanceBlock();
      await time.advanceBlock();
      await time.advanceBlock();
      await time.advanceBlock();

      const expectedFactor = factor.times(factorIncrement).times(factorIncrement)
        .times(factorIncrement).times(factorIncrement);

      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed(CAG_UNIT));
    });

    // TODO: add test cases for total supply and balanceOf
    describe('balance and total supply', function () {
      const tokenOwner = accounts[0];
      const amount = CAG('1000');

      beforeEach(async function () {
        await this.coinage.generateTokens(tokenOwner, amount.toFixed(CAG_UNIT));
      });

      it('should mint amount of tokens', async function () {
        await checkBalanceProm(this.coinage.balanceOf(tokenOwner), amount);
      });

      it('balance should increase exponentially after n blocks', async function () {
        const n = await advanceRandomBlock(4);
        const expectedAmount = fpow(amount, n);
        await checkBalanceProm(this.coinage.balanceOf(tokenOwner), expectedAmount);
      });

      it('balance at specific block should not be changed', async function () {
        const blockNumber = (await time.latestBlock()).toNumber();
        await advanceRandomBlock(4);
        await checkBalanceProm(this.coinage.balanceOfAt(tokenOwner, blockNumber), amount);
      });

      it('total supply should increase exponentially after n blocks', async function () {
        const totalSupply = CAG(await this.coinage.totalSupply(), CAG_UNIT);
        const n = await advanceRandomBlock(4);
        const expectedTotalSupply = fpow(totalSupply, n);
        await checkBalanceProm(this.coinage.totalSupply(), expectedTotalSupply);
      });

      it('total supply at specific block should not be changed', async function () {
        const blockNumber = (await time.latestBlock()).toNumber();
        await advanceRandomBlock(4);
        await checkBalanceProm(this.coinage.totalSupplyAt(blockNumber), amount);
      });
    });
  });

  describe('#ERC20', function () {
    const from = accounts[1];
    const to = accounts[2];

    beforeEach(async function () {
      await advanceRandomBlock();
      await this.coinage.generateTokens(from, initialSupply.toFixed(CAG_UNIT));
    });

    // shouldBehaveLikeERC20Transfer
    describe('#transfer', function () {
      describe('when the recipient is not the zero address', function () {
        describe('when the sender does not have enough balance', function () {
          it('reverts', async function () {
            const amount = CAG(await this.coinage.balanceOf(from), CAG_UNIT).times(CAG('2'));
            await expectRevert(this.coinage.transfer(to, amount.toFixed(CAG_UNIT), { from }),
              'AutoIncrementCoinageSnapshot: transfer amount exceeds balance',
            );
          });
        });

        describe('when the sender transfers all balance', function () {
          it('transfers the requested amount', async function () {
            const amount = CAG(await this.coinage.balanceOf(from), CAG_UNIT);

            const fromBalance = CAG(await this.coinage.balanceOf(from), CAG_UNIT);
            const toBalance = CAG('0');

            const expectedFromBalance = fromBalance.times(factorIncrement).minus(amount);
            const expectedToBalance = toBalance.times(factorIncrement).plus(amount);

            await this.coinage.transfer(to, amount.toFixed(CAG_UNIT), { from });

            await checkBalanceProm(this.coinage.balanceOf(from), expectedFromBalance);
            await checkBalanceProm(this.coinage.balanceOf(to), expectedToBalance);
          });

          it('emits a transfer event', async function () {
            const amount = CAG(await this.coinage.balanceOf(from), CAG_UNIT);

            const { logs } = await this.coinage.transfer(to, amount.toFixed(CAG_UNIT), { from });

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
            await this.coinage.generateTokens(from, CAG('20').toFixed(CAG_UNIT));
            await this.coinage.generateTokens(to, CAG('20').toFixed(CAG_UNIT));

            const expectedFromBalance = CAG(await this.coinage.balanceOf(from), CAG_UNIT).times(factorIncrement);
            const expectedToBalance = CAG(await this.coinage.balanceOf(to), CAG_UNIT).times(factorIncrement);

            await this.coinage.transfer(to, amount.toFixed(CAG_UNIT), { from });

            await checkBalanceProm(this.coinage.balanceOf(from), expectedFromBalance);
            await checkBalanceProm(this.coinage.balanceOf(to), expectedToBalance);
          });

          it('emits a transfer event', async function () {
            const { logs } = await this.coinage.transfer(to, amount.toFixed(CAG_UNIT), { from });

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
          const fromBalance = CAG(await this.coinage.balanceOf(from), CAG_UNIT);
          await expectRevert(this.coinage.transfer(ZERO_ADDRESS, fromBalance.toFixed(CAG_UNIT), { from }),
            'AutoIncrementCoinageSnapshot: transfer to the zero address',
          );
        });
      });

      //
    });

    describe('#transferFrom', function () {
      const spender = accounts[1];
      const tokenOwner = accounts[3];

      beforeEach(async function () {
        await this.coinage.generateTokens(tokenOwner, initialSupply.toFixed(CAG_UNIT));
      });

      describe('when the token owner is not the zero address', function () {
        describe('when the recipient is not the zero address', function () {
          const to = accounts[4];

          describe('when the spender has enough approved balance', function () {
            beforeEach(async function () {
              await this.coinage.approve(spender, initialSupply.toFixed(CAG_UNIT), { from: tokenOwner });
            });

            describe('when the token owner has enough balance', function () {
              const amount = initialSupply;

              it('transfers the requested amount', async function () {
                const tokenOwnerBalance = CAG(await this.coinage.balanceOf(tokenOwner), CAG_UNIT);

                const expectedTokenOwnerBalance = tokenOwnerBalance.times(factorIncrement).minus(amount);
                const expectedToBalance = amount;

                await this.coinage.transferFrom(tokenOwner, to, amount.toFixed(CAG_UNIT), { from: spender });

                await checkBalanceProm(this.coinage.balanceOf(tokenOwner), expectedTokenOwnerBalance);
                await checkBalanceProm(this.coinage.balanceOf(to), expectedToBalance);
              });

              it('decreases the spender allowance', async function () {
                await this.coinage.transferFrom(tokenOwner, to, amount.toFixed(CAG_UNIT), { from: spender });

                expect(await this.coinage.allowance(tokenOwner, spender)).to.be.bignumber.equal('0');
              });

              it('emits a transfer event', async function () {
                const { logs } = await this.coinage.transferFrom(tokenOwner, to, amount.toFixed(CAG_UNIT), { from: spender });

                // NOTE: use expectEvent.inLogs instead of expectEvent to capture returned event.
                const e = expectEvent.inLogs(logs, 'Transfer', {
                  from: tokenOwner,
                  to: to,
                });

                checkBalance(e.args.value, amount);
              });

              it('emits an approval event', async function () {
                const receipt = await this.coinage.transferFrom(tokenOwner, to, amount.toFixed(CAG_UNIT), { from: spender });

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
                  tokenOwner, to, amount.toFixed(CAG_UNIT), { from: spender }),
                'AutoIncrementCoinageSnapshot: transfer amount exceeds allowance',
                );
              });
            });
          });

          describe('when the spender does not have enough approved balance', function () {
            beforeEach(async function () {
              await this.coinage.approve(spender, initialSupply.minus(CAG('1')).toFixed(CAG_UNIT), { from: tokenOwner });
            });

            describe('when the token owner has enough balance', function () {
              const amount = initialSupply;

              it('reverts', async function () {
                await expectRevert(this.coinage.transferFrom(
                  tokenOwner, to, amount.toFixed(CAG_UNIT), { from: spender }), 'AutoIncrementCoinageSnapshot: transfer amount exceeds allowance',
                );
              });
            });

            describe('when the token owner does not have enough balance', function () {
              const amount = initialSupply.times(CAG('2'));

              it('reverts', async function () {
                await expectRevert(this.coinage.transferFrom(
                  tokenOwner, to, amount.toFixed(CAG_UNIT), { from: spender }), 'AutoIncrementCoinageSnapshot: transfer amount exceeds allowance',
                );
              });
            });
          });
        });

        describe('when the recipient is the zero address', function () {
          const amount = initialSupply;
          const to = ZERO_ADDRESS;

          beforeEach(async function () {
            await this.coinage.approve(spender, amount.toFixed(CAG_UNIT), { from: tokenOwner });
          });

          it('reverts', async function () {
            await expectRevert(this.coinage.transferFrom(
              tokenOwner, to, amount.toFixed(CAG_UNIT), { from: spender }), 'AutoIncrementCoinageSnapshot: transfer to the zero address',
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
            const receipt = await this.coinage.approve(spender, amount.toFixed(CAG_UNIT), { from: owner });

            expectEvent(receipt, 'Approval', {
              owner: owner,
              spender: spender,
              value: amount.toFixed(CAG_UNIT),
            });
          });

          describe('when there was no approved amount before', function () {
            it('approves the requested amount', async function () {
              await this.coinage.approve(spender, amount.toFixed(CAG_UNIT), { from: owner });

              expect(await this.coinage.allowance(owner, spender)).to.be.bignumber.equal(amount.toFixed(CAG_UNIT));
            });
          });

          describe('when the spender had an approved amount', function () {
            beforeEach(async function () {
              await this.coinage.approve(spender, new BN(1), { from: owner });
            });

            describe('when the token owner replaces the previous approved amount', function () {
              it('reverts', async function () {
                await expectRevert(this.coinage.approve(spender, amount.toFixed(CAG_UNIT), { from: owner }),
                  'AutoIncrementCoinageSnapshot: invalid approve amount',
                );
              });
            });
          });
        });

        describe('when the sender does not have enough balance', function () {
          const amount = initialSupply.times(CAG('2'));

          it('emits an approval event', async function () {
            const receipt = await this.coinage.approve(spender, amount.toFixed(CAG_UNIT), { from: owner });

            expectEvent(receipt, 'Approval', {
              owner: owner,
              spender: spender,
              value: amount.toFixed(CAG_UNIT),
            });
          });

          describe('when there was no approved amount before', function () {
            it('approves the requested amount', async function () {
              await this.coinage.approve(spender, amount.toFixed(CAG_UNIT), { from: owner });

              expect(await this.coinage.allowance(owner, spender)).to.be.bignumber.equal(amount.toFixed(CAG_UNIT));
            });
          });

          describe('when the spender had an approved amount', function () {
            beforeEach(async function () {
              await this.coinage.approve(spender, new BN(1), { from: owner });
            });

            describe('when the token owner replaces the previous approved amount', function () {
              it('reverts', async function () {
                await expectRevert(this.coinage.approve(spender, amount.toFixed(CAG_UNIT), { from: owner }),
                  'AutoIncrementCoinageSnapshot: invalid approve amount',
                );
              });
            });
          });
        });
      });
    });
  });

  // omit duplicate test cases in #ERC20
  describe('#MiniMeToken', function () {
    describe('#destroyTokens', function () {
      const amount = initialSupply;
      const tokenOwner = accounts[0];

      beforeEach(async function () {
        await this.coinage.generateTokens(tokenOwner, amount.toFixed(CAG_UNIT));
      });

      it('should destroy tokens', async function () {
        const n = await advanceRandomBlock(5);
        const expectedTokenOwnerBalance = fpow(amount, n + 1).minus(amount);

        await this.coinage.destroyTokens(tokenOwner, amount.toFixed(CAG_UNIT));

        await checkBalanceProm(this.coinage.balanceOf(tokenOwner), expectedTokenOwnerBalance);
      });
    });

    describe('#createCloneToken', function () {
      const amount = initialSupply;
      const tokenOwner = accounts[0];

      beforeEach(async function () {
        const { receipt: { blockNumber } } = await this.coinage.generateTokens(tokenOwner, amount.toFixed(CAG_UNIT));

        this.generatedBlock = blockNumber;
        this.skippedBlock = (await advanceRandomBlock(3, 20));

        // console.log('this.skippedBlock', this.skippedBlock);

        const { logs } = await this.coinage.createCloneToken(
          'Cloned AutoIncrementCoinageSnapshot Test',
          'CCT',
          factor.toFixed(CAG_UNIT),
          factorIncrement.toFixed(CAG_UNIT),
          0,
          true,
        );

        const ev = expectEvent.inLogs(logs, 'NewCloneToken');

        this.cloned = await Coinage.at(ev.args.cloneToken);
        this.snapshotBlock = ev.args.snapshotBlock.toNumber();
      });

      afterEach(function () {
        delete this.generatedBlock;
        delete this.skippedBlock;
        delete this.cloned;
        delete this.snapshotBlock;
      });

      describe('when token owner transfer cloned tokens', function () {
        const to = accounts[1];

        beforeEach(async function () {
          const { logs } = await this.cloned.transfer(to, amount.toFixed(CAG_UNIT), { from: tokenOwner });
          const ev = expectEvent.inLogs(logs, 'Transfer', {
            from: tokenOwner,
            to: to,
          });
          checkBalance(ev.args.value, amount);
        });

        it('balance in the cloned token should be deducted', async function () {
          const expectedTokenOwnerBalance = fpow(amount, this.skippedBlock + 2).minus(amount);
          const expectedToBalance = amount;

          await checkBalanceProm(this.cloned.balanceOf(tokenOwner), expectedTokenOwnerBalance);
          await checkBalanceProm(this.cloned.balanceOf(to), expectedToBalance);
        });

        it('balance in the original token should not be changed', async function () {
          const expectedTokenOwnerBalance = fpow(amount, this.skippedBlock + 2);
          const expectedToBalance = CAG('0');

          await checkBalanceProm(this.coinage.balanceOf(tokenOwner), expectedTokenOwnerBalance);
          await checkBalanceProm(this.coinage.balanceOf(to), expectedToBalance);
        });

        it('should clone token balance', async function () {
          const f = function (token) {
            return Promise.all(
              range(this.generatedBlock, this.generatedBlock + this.skippedBlock + 1).map(
                (bn, i) => checkBalanceProm(
                  token.balanceOfAt(tokenOwner, bn),
                  fpow(amount, i),
                ),
              ),
            );
          };

          await f.call(this, this.coinage);
          await f.call(this, this.cloned);
        }).timeout(15000);

        it('should clone total supply', async function () {
          const f = function (token) {
            return Promise.all(
              range(this.generatedBlock, this.generatedBlock + this.skippedBlock + 1).map(
                (bn, i) => checkBalanceProm(
                  token.totalSupplyAt(bn),
                  fpow(amount, i),
                ),
              ),
            );
          };

          await f.call(this, this.coinage);
          await f.call(this, this.cloned);
        }).timeout(15000);
      });

      it('should clone the cloned token', async function () {
        const { logs } = await this.coinage.createCloneToken(
          'Cloned AutoIncrementCoinageSnapshot Test2',
          'CCT2',
          factor.toFixed(CAG_UNIT),
          factorIncrement.toFixed(CAG_UNIT),
          0,
          true,
        );

        const e = expectEvent.inLogs(logs, 'NewCloneToken');

        this.cloned2 = await Coinage.at(e.args.cloneToken);
      });
    });
  });
});
