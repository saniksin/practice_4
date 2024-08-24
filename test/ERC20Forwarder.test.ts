import { loadFixture, ethers } from "./setup";
import { expect } from "chai";

describe("ERC20 Forwarder Contract (Meta tx)", function () {

    let minAmount = ethers.parseUnits("10", 18);

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

    describe("Meta-transaction functionality with permit", function () {

        it("Should successfully execute a meta-transaction using permit and take a fee", async function () {
            const { owner, forwarder, ERC20Token, user, recipient, relayer } = await loadFixture(deployContractsFixture);
        
            const nonce = await forwarder.nonces(user.address);
            const amount = ethers.parseUnits("100", 18);
            const deadline = ethers.MaxUint256;

            // Создаем домен и типы для подписи permit
            const domain = {
                name: await ERC20Token.name(),
                version: "1",
                chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
                verifyingContract: ERC20Token.target.toString(),
            };

            const permitTypes = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            };

            const permitMessage = {
                owner: user.address,
                spender: forwarder.target.toString(),
                value: amount,
                nonce: await ERC20Token.nonces(user.address),
                deadline: deadline,
            };

            // Подписываем данные permit
            const permitSignature = await user.signTypedData(domain, permitTypes, permitMessage);

            // Разделяем подпись на v, r, s
            const permitR = permitSignature.slice(0, 66);
            const permitS = "0x" + permitSignature.slice(66, 130);
            const permitV = parseInt(permitSignature.slice(130, 132), 16);
            
            // Создаем подпись на трансфер
            const metaTxNonce = await forwarder.nonces(user.address);
            const metaTxDomain = {
                name: "ERC20Forwarder",
                version: "1",
                chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
                verifyingContract: forwarder.target.toString(),
            };
        
            const metaTxTypes = {
                MetaTransaction: [
                    { name: "tokenAddress", type: "address" },
                    { name: "recipient", type: "address" },
                    { name: "amount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "user", type: "address" },
                ],
            };
        
            const metaTxMessage = {
                tokenAddress: ERC20Token.target,
                recipient: recipient.address,
                amount: amount,
                nonce: metaTxNonce,
                user: user.address,
            };
        
            // Подписываем мета-транзакцию
            const metaTxSignature = await user.signTypedData(metaTxDomain, metaTxTypes, metaTxMessage);
        
            // Разделяем подпись на v, r, s для мета-транзакции
            const metaTxR = metaTxSignature.slice(0, 66);
            const metaTxS = "0x" + metaTxSignature.slice(66, 130);
            const metaTxV = parseInt(metaTxSignature.slice(130, 132), 16);
        
            // Перед выполнением проверяем баланс
            const initialUserBalance = await ERC20Token.balanceOf(user.address);
            const initialRecipientBalance = await ERC20Token.balanceOf(recipient.address);
            const initialOwnerBalance = await ERC20Token.balanceOf(owner.address);
            
            // Выполняем мета-транзакцию через forwarder
            await forwarder.connect(relayer).executeMetaTransaction(
              user.address,
              ERC20Token.target,
              recipient.address,
              amount,
              metaTxNonce,
              metaTxR,
              metaTxS,
              metaTxV,
              deadline,
              permitV,
              permitR,
              permitS
            );
        
            // Проверяем, что баланс пользователя уменьшился на сумму перевода
            expect(await ERC20Token.balanceOf(user.address)).to.equal(initialUserBalance - amount);
        
            // Проверяем, что баланс получателя увеличился на сумму перевода минус комиссия
            expect(await ERC20Token.balanceOf(recipient.address)).to.equal(initialRecipientBalance + (amount * 90n / 100n));
        
            // Проверяем, что баланс владельца контракта увеличился на комиссию
            expect(await ERC20Token.balanceOf(owner.address)).to.equal(initialOwnerBalance + (amount * 10n / 100n));
        });
        
        it("Should fail with an amount less than the minimum required", async function () {
            const { forwarder, ERC20Token, user, recipient, relayer } = await loadFixture(deployContractsFixture);

            const nonce = await forwarder.nonces(user.address);
            const amount = ethers.parseUnits("5", 18); // Меньше минимального
            const deadline = ethers.MaxUint256;

            // Создаем домен и типы для подписи permit
            const domain = {
                name: await ERC20Token.name(),
                version: "1",
                chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
                verifyingContract: ERC20Token.target.toString(),
            };

            const permitTypes = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            };

            const permitMessage = {
                owner: user.address,
                spender: forwarder.target.toString(),
                value: amount,
                nonce: await ERC20Token.nonces(user.address),
                deadline: deadline,
            };

            // Подписываем данные permit
            const permitSignature = await user.signTypedData(domain, permitTypes, permitMessage);

            // Разделяем подпись на v, r, s
            const permitR = permitSignature.slice(0, 66);
            const permitS = "0x" + permitSignature.slice(66, 130);
            const permitV = parseInt(permitSignature.slice(130, 132), 16);

            const messageHash = ethers.solidityPackedKeccak256(
                ["address", "address", "uint256", "uint256", "address"],
                [ERC20Token.target, recipient.address, amount, nonce, user.address]
            );

            // Создаем подпись
            const signature = await user.signMessage(messageHash);
            const { v, r, s } = ethers.Signature.from(signature);

            await expect(
                forwarder.connect(relayer).executeMetaTransaction(
                    user.address,
                    ERC20Token.target,
                    recipient.address,
                    amount,
                    nonce,
                    r,
                    s,
                    v,
                    deadline,
                    permitV,
                    permitR,
                    permitS
                )
            ).to.be.revertedWith("ERC20Forwarder: Amount is less than the minimum required");
        });

        it("Should fail with an invalid signature", async function () {
            const { forwarder, ERC20Token, user, recipient, relayer } = await loadFixture(deployContractsFixture);

            const nonce = await forwarder.nonces(user.address);
            const amount = ethers.parseUnits("100", 18);
            const deadline = ethers.MaxUint256;

            // Создаем домен и типы для подписи permit
            const domain = {
                name: await ERC20Token.name(),
                version: "1",
                chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
                verifyingContract: ERC20Token.target.toString(),
            };

            const permitTypes = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            };

            const permitMessage = {
                owner: user.address,
                spender: forwarder.target.toString(),
                value: amount,
                nonce: await ERC20Token.nonces(user.address),
                deadline: deadline,
            };

            // Подписываем данные permit
            const permitSignature = await user.signTypedData(domain, permitTypes, permitMessage);

            // Разделяем подпись на v, r, s
            const permitR = permitSignature.slice(0, 66);
            const permitS = "0x" + permitSignature.slice(66, 130);
            const permitV = parseInt(permitSignature.slice(130, 132), 16);

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
                    v,
                    deadline,
                    permitV,
                    permitR,
                    permitS
                )
            ).to.be.revertedWith("ERC20Forwarder: signature does not match");
        });

        it("Should fail if permit does not allow token transfer", async function () {
            const { forwarder, ERC20Token, user, recipient, relayer } = await loadFixture(deployContractsFixture);

            const nonce = await forwarder.nonces(user.address);
            const amount = ethers.parseUnits("100", 18);
            const deadline = ethers.MaxUint256;

            // Создаем домен и типы для подписи permit
            const domain = {
                name: await ERC20Token.name(),
                version: "1",
                chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
                verifyingContract: ERC20Token.target.toString(),
            };

            const permitTypes = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            };

            // Пытаемся создать permit с нулевой суммой (ожидаем сбой)
            const permitMessage = {
                owner: user.address,
                spender: forwarder.target.toString(),
                value: 0, // Нулевое разрешение, что приведет к ошибке
                nonce: await ERC20Token.nonces(user.address),
                deadline: deadline,
            };

            // Подписываем данные permit
            const permitSignature = await user.signTypedData(domain, permitTypes, permitMessage);

            // Разделяем подпись на v, r, s
            const permitR = permitSignature.slice(0, 66);
            const permitS = "0x" + permitSignature.slice(66, 130);
            const permitV = parseInt(permitSignature.slice(130, 132), 16);

            const metaTxNonce = await forwarder.nonces(user.address);

            const messageHash = ethers.solidityPackedKeccak256(
                ["address", "address", "uint256", "uint256", "address"],
                [ERC20Token.target, recipient.address, amount, metaTxNonce, user.address]
            );

            const signature = await user.signMessage(messageHash);
            const { v, r, s } = ethers.Signature.from(signature);

            // Выполняем мета-транзакцию и ожидаем, что она будет отвергнута из-за проблемы с permit
            await expect(
                forwarder.connect(relayer).executeMetaTransaction(
                    user.address,
                    ERC20Token.target,
                    recipient.address,
                    amount,
                    metaTxNonce,
                    r,
                    s,
                    v,
                    deadline,
                    permitV,
                    permitR,
                    permitS
                )
            ).to.be.revertedWith("ERC20Permit: invalid signature");
        });
    });
});
