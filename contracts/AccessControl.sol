// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract MyAccessControlContract is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant USER_ROLE = keccak256("USER_ROLE");

    // устанавливаем msg.senderу дефолтную роль
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // Только администратор может добавлять новых администраторов
    function addAdmin(address account) public onlyRole(ADMIN_ROLE) {
        grantRole(ADMIN_ROLE, account);
    }

    // Только администратор может добавлять новых пользователей
    function addUser(address account) public onlyRole(ADMIN_ROLE) {
        grantRole(USER_ROLE, account);
    }
}
