const {
  defaultSender, accounts, contract, web3,
} = require('@openzeppelin/test-environment');

const {
  BN, constants, expectEvent, expectRevert, time,
} = require('@openzeppelin/test-helpers');

const { Currency, createCurrency, createCurrencyRatio } = require('@makerdao/currency');
const { expect } = require('chai');

const { ZERO_ADDRESS } = constants;

const Coinage = contract.fromArtifact('CoinageMock');

const CAG = createCurrency('CAG');

describe('Coinage', () => {
  let factor;
  let factorIncrement;

  before(async function () {
    factor = CAG('1.00');
    factorIncrement = CAG('1.19');

    this.coinage = await Coinage.new(
      'Coinage Tesg',
      'CAT',
      factor.toFixed('ray'),
      factorIncrement.toFixed('ray'),
    );
  });

  describe('#factor', () => {
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
      await web3.eth.sendTransaction({ from: defaultSender, to: defaultSender, value: 0 });

      await this.coinage.mint(accounts[0], 0);

      const expectedFactor = factor.times(factorIncrement).times(factorIncrement)
        .times(factorIncrement).times(factorIncrement);

      expect(await this.coinage.factor()).to.be.bignumber.equal(expectedFactor.toFixed('ray'));
    });
  });

  describe('#ERC20', () => {
    describe('#transfer');
  });
});
