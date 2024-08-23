import { loadFixture, ethers } from "./setup";
import { expect } from "chai";
import { Log } from "ethers";

describe("ProxyFactory Contract", function () {

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

    describe("Factory Deployment", function () {
        it("Should deploy factory with correct beacon address", async function () {
            const { factory, beacon } = await loadFixture(deployFactoryFixture);
            const beaconAddress = await factory.beacon();
            expect(beaconAddress).to.equal(beacon.target);
        });
    });

    describe("Proxy Creation", function () {
        it("Should create a new proxy and emit ProxyCreated event", async function () {
            const { factory, user } = await loadFixture(deployFactoryFixture);

            const tx = await factory.connect(user).createProxy();
            const receipt: any = await tx.wait();

            // Проверяем, что есть логи и берем первый
            if (!receipt.logs || receipt.logs.length === 0) {
                throw new Error("No logs found in the transaction receipt");
            }

            const event: Log = receipt.logs[0];
            const parsedLog: any = factory.interface.parseLog(event);

            expect(parsedLog.name).to.equal("ProxyCreated");

            const proxyAddress = parsedLog.args.proxy;
            expect(proxyAddress).to.be.properAddress;
        });

        it("Should allow multiple proxies to be created", async function () {
            const { factory, user } = await loadFixture(deployFactoryFixture);

            const proxies = [];

            for (let i = 0; i < 5; i++) {
                const tx = await factory.connect(user).createProxy();
                const receipt: any = await tx.wait();

                // Проверяем, что есть логи и берем первый
                if (!receipt.logs || receipt.logs.length === 0) {
                    throw new Error("No logs found in the transaction receipt");
                }

                const event: Log = receipt.logs[0];
                const parsedLog: any = factory.interface.parseLog(event);

                expect(parsedLog.name).to.equal("ProxyCreated");

                const proxyAddress = parsedLog.args.proxy;
                proxies.push(proxyAddress);

                expect(proxyAddress).to.be.properAddress;
            }

            // Убедимся, что все созданные адреса разные
            const uniqueProxies = [...new Set(proxies)];
            expect(uniqueProxies.length).to.equal(proxies.length);
        });
    });
});
