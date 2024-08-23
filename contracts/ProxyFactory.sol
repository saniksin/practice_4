// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./BeaconProxy.sol";

contract ProxyFactory {
    address public immutable beacon;
    address[] public proxies;

    event ProxyCreated(address proxy);

    constructor(address _beacon) {
        beacon = _beacon;
    }

    function createProxy() external returns (address) {
        BeaconProxy proxy = new BeaconProxy(beacon);
        proxies.push(address(proxy));
        emit ProxyCreated(address(proxy));
        return address(proxy);
    }

    function getProxies() external view returns (address[] memory) {
        return proxies;
    }
}
