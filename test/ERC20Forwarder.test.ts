import { loadFixture, ethers } from "./setup";
import { expect } from "chai";

describe("ERC20 Forwarder Contract (Meta tx)", function () {

    let minAmount = ethers.parseUnits("10", 18)

    // Фикстура для развертывания контракта и необходимых данных
    async function deployContractsFixture() {
        const [owner, user, recipient, relayer] = await ethers.getSigners();

        // Развертываем контракт ERC20 токена
        const ERC20TokenFactory = await ethers.getContractFactory("MyERC20Token");
        const ERC20Token = await ERC20TokenFactory.deploy("SolidityDeveloper", "OTUS", 18);
        await ERC20Token.waitForDeployment();

        // Развертываем контракт Forwarder
        const ForwarderFactory = await ethers.getContractFactory("ERC20Forwarder");
        const forwarder = await ForwarderFactory.deploy();
        await forwarder.waitForDeployment();

        // Добавляем токен в список поддерживаемых
        await forwarder.addSupportedToken(ERC20Token.target, minAmount);

        // Моделируем выдачу токенов пользователю
        await ERC20Token.mint(user.address, ethers.parseUnits("1000", 18));

        return { forwarder, ERC20Token, owner, user, recipient, relayer };
    }

    describe("Support for tokens", function () {

        it("Should add and remove supported tokens", async function () {
            const { forwarder, ERC20Token } = await loadFixture(deployContractsFixture);

            // Добавление токена
            expect((await forwarder.supportedTokens(ERC20Token.target))._tokenSupported).to.be.true;

            // Удаление токена
            await forwarder.removeSupportedToken(ERC20Token.target);
            expect((await forwarder.supportedTokens(ERC20Token.target))._tokenSupported).to.be.false;
        });

        it("Should fail to verify transactions for unsupported tokens", async function () {
            const { forwarder, ERC20Token, user, recipient } = await loadFixture(deployContractsFixture);

            // Удаляем токен из поддерживаемых
            await forwarder.removeSupportedToken(ERC20Token.target);

            // Пробуем верифицировать транзакцию с неподдерживаемым токеном
            const nonce = await forwarder.nonces(user.address);
            const amount = ethers.parseUnits("100", 18);

            const messageHash = ethers.solidityPackedKeccak256(
                ["address", "address", "uint256", "uint256", "address"],
                [ERC20Token.target, recipient.address, amount, nonce, user.address]
            );

            const signature = await user.signMessage(messageHash);
            const { v, r, s } = ethers.Signature.from(signature);

            await expect(
                forwarder.verify(user.address, ERC20Token.target, recipient.address, amount, nonce, r, s, v)
            ).to.be.revertedWith("ERC20Forwarder: Token not supported");
        });
    });

    describe("Meta-transaction functionality", function () {

        it("Should successfully execute a meta-transaction and take a fee", async function () {
            const { owner, forwarder, ERC20Token, user, recipient, relayer } = await loadFixture(deployContractsFixture);
        
            const nonce = await forwarder.nonces(user.address);
            const amount = ethers.parseUnits("100", 18);
            const domain = {
                name: "ERC20Forwarder",
                version: "1",
                chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
                verifyingContract: forwarder.target.toString(),
            };
        
            const types = {
                MetaTransaction: [
                    { name: "tokenAddress", type: "address" },
                    { name: "recipient", type: "address" },
                    { name: "amount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "user", type: "address" },
                ],
            };
        
            const message = {
                tokenAddress: ERC20Token.target,
                recipient: recipient.address,
                amount: amount,
                nonce: nonce,
                user: user.address,
            };
        
            // Подписываем данные
            const signature = await user.signTypedData(domain, types, message);
        
            // Разделяем подпись на v, r, s
            const r = signature.slice(0, 66);
            const s = "0x" + signature.slice(66, 130);
            const v = parseInt(signature.slice(130, 132), 16);
        
            // Перед выполнением проверяем баланс
            const initialUserBalance = await ERC20Token.balanceOf(user.address);
            const initialRecipientBalance = await ERC20Token.balanceOf(recipient.address);
            const initialRelayerBalance = await ERC20Token.balanceOf(relayer.address);
        
            // Одобрение контракта для перевода токенов
            await ERC20Token.connect(user).approve(forwarder.target, amount);
        
            // Выполняем мета-транзакцию
            await forwarder.connect(relayer).executeMetaTransaction(
              user.address,
              ERC20Token.target,
              recipient.address,
              amount,
              nonce,
              r,
              s,
              v
            );
        
            // Проверяем, что баланс пользователя уменьшился на сумму перевода
            expect(await ERC20Token.balanceOf(user.address)).to.equal(initialUserBalance - amount);
        
            // Проверяем, что баланс получателя увеличился на сумму перевода минус комиссия
            expect(await ERC20Token.balanceOf(recipient.address)).to.equal(initialRecipientBalance + (amount * 90n / 100n));
        
            // Проверяем, что баланс ретранслятора увеличился на комиссию
            expect(await ERC20Token.balanceOf(owner.address)).to.equal(initialRelayerBalance + (amount * 10n / 100n));
        });
        
        it("Should fail with an amount is less than the minimum required", async function () {
            const { forwarder, ERC20Token, user, recipient, relayer } = await loadFixture(deployContractsFixture);

            const nonce = await forwarder.nonces(user.address);
            const amount = ethers.parseUnits("100", 18);

            const messageHash = ethers.solidityPackedKeccak256(
                ["address", "address", "uint256", "uint256", "address"],
                [ERC20Token.target, recipient.address, amount, nonce, user.address]
            );

            // Создаем неправильную подпись
            const wrongSignature = await relayer.signMessage(messageHash);
            const { v, r, s } = ethers.Signature.from(wrongSignature);

            await expect(
                forwarder.connect(relayer).executeMetaTransaction(
                    user.address,
                    ERC20Token.target,
                    recipient.address,
                    amount,
                    nonce,
                    r,
                    s,
                    v
                )
            ).to.be.revertedWith("ERC20Forwarder: Amount is less than the minimum required");
        });

        it("Should fail with an invalid signature", async function () {
            const { forwarder, ERC20Token, user, recipient, relayer } = await loadFixture(deployContractsFixture);

            const nonce = await forwarder.nonces(user.address);
    
            const messageHash = ethers.solidityPackedKeccak256(
                ["address", "address", "uint256", "uint256", "address"],
                [ERC20Token.target, recipient.address, minAmount, nonce, user.address]
            );

            // Создаем неправильную подпись
            const wrongSignature = await relayer.signMessage(messageHash);
            const { v, r, s } = ethers.Signature.from(wrongSignature);

            // Одобрение контракта для перевода токенов
            await ERC20Token.connect(user).approve(forwarder.target, minAmount);

            await expect(
                forwarder.connect(relayer).executeMetaTransaction(
                    user.address,
                    ERC20Token.target,
                    recipient.address,
                    minAmount,
                    nonce,
                    r,
                    s,
                    v
                )
            ).to.be.revertedWith("ERC20Forwarder: signature does not match");
        });
    });
});
