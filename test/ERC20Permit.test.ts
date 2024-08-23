import { loadFixture, ethers } from "./setup";
import { keccak256, toUtf8Bytes, getBytes, concat, solidityPacked } from "ethers";
import { expect } from "chai";

describe("ERC20 Permit", function () {

  async function deployContractsFixture() {
    const [admin, user, spender] = await ethers.getSigners();

    const ERC20TokenFactory = await ethers.getContractFactory("MyERC20Token");
    const ERC20Token = await ERC20TokenFactory.deploy("SolidityDeveloper", "OTUS", 18);
    await ERC20Token.waitForDeployment();

    return { ERC20Token, admin, user, spender };
  }

  describe("Permit functionality", function () {

    it("Should successfully execute a permit", async function () {
      const { ERC20Token, user, spender } = await loadFixture(deployContractsFixture);
    
      const nonce = await ERC20Token.nonces(user.address);
      const deadline = ethers.MaxUint256;
    
      const value = ethers.parseUnits("100", 18);
    
      // Создаем домен и типы для подписи
      const domain = {
        name: await ERC20Token.name(),
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: ERC20Token.target.toString()
      };
    
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };
    
      const message = {
        owner: user.address,
        spender: spender.address,
        value: value,
        nonce: nonce,
        deadline: deadline
      };
    
      // Подписываем данные
      const signature = await user.signTypedData(domain, types, message);
    
      // Разделяем подпись на v, r, s
      const r = signature.slice(0, 66);
      const s = "0x" + signature.slice(66, 130);
      const v = parseInt(signature.slice(130, 132), 16);
    
      // Выполнение permit
      await ERC20Token.connect(spender).permit(user.address, spender.address, value, deadline, v, r, s);
    
      // Проверка allowance
      const allowance = await ERC20Token.allowance(user.address, spender.address);
      expect(allowance).to.equal(value);
    
      // Дополнительная проверка nonce
      const newNonce = await ERC20Token.nonces(user.address);
      expect(newNonce).to.equal(nonce + 1n);
    });

    it("Should fail with an expired deadline", async function () {
      const { ERC20Token, user, spender } = await loadFixture(deployContractsFixture);

      const nonce = await ERC20Token.nonces(user.address);
      const deadline = 0;

      const DOMAIN_SEPARATOR = await ERC20Token.DOMAIN_SEPARATOR();
      const PERMIT_TYPEHASH = await ERC20Token.PERMIT_TYPEHASH();

      const value = ethers.parseUnits("100", 18);

      const structHash = keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
          [PERMIT_TYPEHASH, user.address, spender.address, value, nonce, deadline]
        )
      );

      const digest = keccak256(
        solidityPacked(
          ["bytes1", "bytes1", "bytes32", "bytes32"],
          [getBytes("0x19"), getBytes("0x01"), DOMAIN_SEPARATOR, structHash]
        )
      );

      const flatSignature = await user.signMessage(getBytes(digest));
      const signature = ethers.Signature.from(flatSignature);

      await expect(
        ERC20Token.connect(spender).permit(user.address, spender.address, value, deadline, signature.v, signature.r, signature.s)
      ).to.be.revertedWith("ERC20Permit: expired deadline");
    });

    it("Should fail with invalid signature", async function () {
      const { ERC20Token, user, spender } = await loadFixture(deployContractsFixture);

      const nonce = await ERC20Token.nonces(user.address);
      const deadline = ethers.MaxUint256;

      const DOMAIN_SEPARATOR = await ERC20Token.DOMAIN_SEPARATOR();
      const PERMIT_TYPEHASH = await ERC20Token.PERMIT_TYPEHASH();

      const value = ethers.parseUnits("100", 18);

      const structHash = keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
          [PERMIT_TYPEHASH, user.address, spender.address, value, nonce, deadline]
        )
      );

      const digest = keccak256(
        solidityPacked(
          ["bytes1", "bytes1", "bytes32", "bytes32"],
          [getBytes("0x19"), getBytes("0x01"), DOMAIN_SEPARATOR, structHash]
        )
      );

      const flatSignature = await user.signMessage(getBytes(digest));
      const signature = ethers.Signature.from(flatSignature);

      const wrongValue = ethers.parseUnits("50", 18);

      await expect(
        ERC20Token.connect(spender).permit(user.address, spender.address, wrongValue, deadline, signature.v, signature.r, signature.s)
      ).to.be.revertedWith("ERC20Permit: invalid signature");
    });

  });
});
