import { loadFixture, ethers, expect } from "./setup";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/src/signers.ts";
import { MyERC20Token } from "../typechain-types";


describe("ERC20 AccessControl", function () {

  // Фикстура для развертывания контракта
  async function deployContractsFixture() {
    const [admin, user] = await ethers.getSigners();

    const ERC20TokenFactory = await ethers.getContractFactory("MyERC20Token");
    const ERC20Token = await ERC20TokenFactory.deploy("SolidityDeveloper", "OTUS", 18);
    await ERC20Token.waitForDeployment();
    
    return { ERC20Token, admin, user };
  }
  
  describe("Add/Remove roles", function () {

    // Проверка, что admin имеет роль ADMIN_ROLE
    it("Admin has ADMIN_ROLE", async function () {
      const { ERC20Token, admin } = await loadFixture(deployContractsFixture);
      
      const ADMIN_ROLE = await ERC20Token.ADMIN_ROLE();
      const hasRole = await ERC20Token.hasRole(ADMIN_ROLE, admin.address);
      
      expect(hasRole).to.be.true;
    });

    // Проверка, что user не имеет роли ADMIN_ROLE
    it("Random address does not have ADMIN_ROLE", async function () {
      const { ERC20Token, user } = await loadFixture(deployContractsFixture);
      
      const ADMIN_ROLE = await ERC20Token.ADMIN_ROLE();
      const hasRole = await ERC20Token.hasRole(ADMIN_ROLE, user.address);
      
      expect(hasRole).to.be.false;
    });

    // Добавление user в USER_ROLE
    it("Admin can add USER_ROLE to a user", async function () {
      const { ERC20Token, admin, user } = await loadFixture(deployContractsFixture);
      
      await ERC20Token.connect(admin).addUser(user.address);
      
      const USER_ROLE = await ERC20Token.USER_ROLE();
      const hasRole = await ERC20Token.hasRole(USER_ROLE, user.address);
      
      expect(hasRole).to.be.true;
    });

    // Добавление user в USER_ROLE
    it("Admin can add ADMIN_ROLE to a user", async function () {
      const { ERC20Token, admin, user } = await loadFixture(deployContractsFixture);
      
      await ERC20Token.connect(admin).addAdmin(user.address);
      
      const ADMIN_ROLE = await ERC20Token.ADMIN_ROLE();
      const hasRole = await ERC20Token.hasRole(ADMIN_ROLE, user.address);
      
      expect(hasRole).to.be.true;
    });

    // Проверка, что user не может добавлять роли
    it("User cannot add USER_ROLE to another user", async function () {
      const { ERC20Token, user } = await loadFixture(deployContractsFixture);
      
      const otherUser = ethers.Wallet.createRandom();
      
      await expect(ERC20Token.connect(user).addUser(otherUser.address)).to.be.reverted;
    });
  });

  describe("Role-based interaction with the contract", function () {

    // Тестирование функции mint - доступна только администратору
    it("Admin can mint tokens", async function () {
        const { ERC20Token, admin } = await loadFixture(deployContractsFixture);

        await ERC20Token.connect(admin).mint(admin.address, ethers.parseEther("10"));

        const balance = await ERC20Token.balanceOf(admin.address);
        expect(balance).to.equal(ethers.parseEther("10"));
    });

    // Проверка отказа в доступе к функции mint для пользователя без прав администратора
    it("A wallet not in the USER_ROLE cannot mint tokens.", async function () {
        const { ERC20Token, user } = await loadFixture(deployContractsFixture);

        await expect(ERC20Token.connect(user).mint(user.address, ethers.parseEther("10")))
            .to.be.reverted;
    });

    // Проверка отказа в доступе к функции withdrawETH для пользователя без прав администратора
    it("Random wallet cannot withdraw ETH", async function () {
        const { ERC20Token, user } = await loadFixture(deployContractsFixture);

        await expect(ERC20Token.connect(user).withdrawETH())
            .to.be.reverted;
    });

    // Функция для добавления роли пользователю и покупки токенов
    async function addUserAndBuyTokens(admin: HardhatEthersSigner | any, user: HardhatEthersSigner | any, ERC20Token: MyERC20Token) {
      // Добавляем пользователя с помощью администратора
      await ERC20Token.connect(admin).addUser(user.address);
  
      // Пользователь покупает токены
      await ERC20Token.connect(user).buyTokens({ value: ethers.parseEther("1") });
  }
    
    // Тестирование функции buyTokens - доступна только пользователю с ролью USER_ROLE
    it("User with USER_ROLE can buy tokens", async function () {
        const { ERC20Token, admin, user } = await loadFixture(deployContractsFixture);

        await addUserAndBuyTokens(admin, user, ERC20Token);

        const balance = await ERC20Token.balanceOf(user.address);
        expect(balance).to.equal(ethers.parseEther("1"));
    });

    // Тестирование функции buyTokens - доступна только пользователю с ролью USER_ROLE
    it("ADMIN can withraw ETH from CONRACT", async function () {
        const { ERC20Token, admin, user } = await loadFixture(deployContractsFixture);

        const balanceChange = ethers.parseEther("1")

        await addUserAndBuyTokens(admin, user, ERC20Token);

        await expect(ERC20Token.withdrawETH()).to.changeEtherBalances([ERC20Token, admin], [-balanceChange, balanceChange]);
    });

    // Проверка отказа в доступе к функции buyTokens для пользователя без роли USER_ROLE
    it("User without USER_ROLE cannot buy tokens", async function () {
        const { ERC20Token, user } = await loadFixture(deployContractsFixture);

        await expect(ERC20Token.connect(user).buyTokens({ value: ethers.parseEther("1") }))
            .to.be.reverted;
    });
  });

});
