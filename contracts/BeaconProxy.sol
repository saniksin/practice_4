// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./Beacon.sol";

// прокси-контракт, который будет использовать Beacon для определения адреса реализации.
contract BeaconProxy {
    address private beacon;

    constructor(address _beacon) {
        beacon = _beacon;
    }

    fallback() external payable {
        address implementation = Beacon(beacon).implementationAddress();
        require(implementation != address(0), "Implementation not set");

        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize())
            let result := delegatecall(gas(), implementation, ptr, calldatasize(), 0, 0)
            let size := returndatasize()
            returndatacopy(ptr, 0, size)
            switch result
            case 0 { revert(ptr, size) }
            default { return(ptr, size) }
        }
    }

    receive() external payable {}
}