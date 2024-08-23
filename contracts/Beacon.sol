// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// отвечает за хранение адреса текущей реализации и предоставляет функцию для обновления этого адреса.
contract Beacon {
    address private implementation;
    address private owner;

    event Upgraded(address indexed implementation);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor(address _implementation) {
        implementation = _implementation;
        owner = msg.sender;
    }

    function implementationAddress() external view returns (address) {
        return implementation;
    }

    function upgrade(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "Invalid address");
        implementation = newImplementation;
        emit Upgraded(newImplementation);
    }
}
