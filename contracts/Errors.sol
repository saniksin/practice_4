// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @dev Генерируется, когда произошла ошибка при выводе средств.
 * @param account Адрес аккаунта, который пытался вывести средства.
 */
error ETHWithdrawError(address account);

/**
 * @dev Генерируется, когда на контракте вывода нет ETH.
 * @param account Адрес аккаунта, который пытался вывести средства.
 */
error WithdrawAmountZero(address account);


/**
 * @dev Генерируется, когда сумма депозита равна нулю.
 * @param account Адрес аккаунта, который пытался внести средства.
 */
error DepositAmountZero(address account);