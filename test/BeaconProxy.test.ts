import { loadFixture, ethers } from "./setup";
import { expect } from "chai";
import { Log } from "ethers";

describe("BeaconProxy", function () {

    async function deployFactoryFixture() {
        const [owner, user] = await ethers.getSigners();

        // Развертываем первую версию логического контракта (MyERC20Token)
        const ERC20TokenV1Factory = await ethers.getContractFactory("MyERC20Token");
        const tokenV1 = await ERC20TokenV1Factory.deploy("SolidityDeveloper", "OTUS", 18);
        await tokenV1.waitForDeployment();

        // Развертываем Beacon контракт с первой реализацией
        const BeaconFactory = await ethers.getContractFactory("Beacon");
        const beacon = await BeaconFactory.deploy(tokenV1.target);
        await beacon.waitForDeployment();

        // Развертываем фабрику прокси-контрактов
        const FactoryFactory = await ethers.getContractFactory("ProxyFactory");
        const factory = await FactoryFactory.deploy(beacon.target);
        await factory.waitForDeployment();

        return { factory, beacon, tokenV1, owner, user };
    }

    it("Should create new proxies and interact with them", async function () {
        const { factory, beacon, tokenV1, owner, user } = await loadFixture(deployFactoryFixture);

        // Создаем 10 прокси-контрактов через фабрику
        const proxies = [];
        for (let i = 0; i < 10; i++) {
            const tx = await factory.connect(user).createProxy();
            const receipt: any = await tx.wait();

            // Проверяем, что есть логи и берем первый
            if (!receipt.logs || receipt.logs.length === 0) {
                throw new Error("No logs found in the transaction receipt");
            }

            const event: Log = receipt.logs[0];
            const parsedLog = factory.interface.parseLog(event);

            expect(parsedLog?.name).to.equal("ProxyCreated");

            const proxyAddress = parsedLog?.args.proxy;
            const proxy = await ethers.getContractAt("MyERC20Token", proxyAddress);
            proxies.push(proxy);

            // Инициализация прокси-контракта
            await proxy.connect(user).initialize(`SolidityDeveloper-${i}`, "OTUS", 18);

            // Проверка адреса начальной реализации
            const initialImplementation = await beacon.implementationAddress();
            expect(initialImplementation).to.equal(tokenV1.target);
        }

        // Развертываем новую версию логического контракта (MyERC20Token)
        const ERC20TokenV2Factory = await ethers.getContractFactory("MyERC20Token");
        const tokenV2 = await ERC20TokenV2Factory.deploy("SolidityDeveloper2", "OTUS", 18);
        await tokenV2.waitForDeployment();

        // Обновляем реализацию в Beacon
        await beacon.connect(owner).upgrade(tokenV2.target);

        // Проверяем адрес конечной реализации после обновления для всех прокси
        for (let i = 0; i < proxies.length; i++) {
            const finalImplementation = await beacon.implementationAddress();
            expect(finalImplementation).to.equal(tokenV2.target);
        }
    });

    it("Should mint tokens correctly before and after implementation upgrade", async function () {
        const { factory, beacon, owner, user } = await loadFixture(deployFactoryFixture);

        // Создаем прокси-контракт через фабрику
        const tx = await factory.connect(user).createProxy();
        const receipt: any = await tx.wait();

        // Проверяем, что есть логи и берем первый
        if (!receipt.logs || receipt.logs.length === 0) {
            throw new Error("No logs found in the transaction receipt");
        }

        const event: Log = receipt.logs[0];
        const parsedLog = factory.interface.parseLog(event);

        expect(parsedLog?.name).to.equal("ProxyCreated");

        const proxyAddress = parsedLog?.args.proxy;
        const proxy = await ethers.getContractAt("MyERC20Token", proxyAddress);

        // Инициализация прокси-контракта
        await proxy.connect(user).initialize("OldImplementation", "OTUS", 18);

        // Тестируем функцию mint до обновления реализации
        await proxy.connect(user).mint(user.address, 100);
        expect(await proxy.balanceOf(user.address)).to.equal(100);

        // Развертываем новую версию логического контракта (MyERC20Token)
        const ERC20TokenV2Factory = await ethers.getContractFactory("MyERC20Token");
        const tokenV2 = await ERC20TokenV2Factory.deploy("NewImplementation", "OTUS", 18);
        await tokenV2.waitForDeployment();

        // Обновляем реализацию в Beacon
        await beacon.connect(owner).upgrade(tokenV2.target);

        // Тестируем функцию mint после обновления реализации
        await proxy.connect(user).mint(user.address, 200);
        expect(await proxy.balanceOf(user.address)).to.equal(300); // Сумма: 100 + 200
    });
});
