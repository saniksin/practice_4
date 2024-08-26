// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./IERC20.sol";

contract ERC20Forwarder {
    using ECDSA for bytes32;

    // Адрес владельца контракта
    address public owner;
    
    // Процент комиссии (10%)
    uint256 public feePercent = 10;
    
    // Структура для поддерживаемых ERC20 токенов
    struct SupportedToken {
        bool _tokenSupported;
        uint256 _minAmount;
    }

    // Маппинг поддерживаемых токенов
    mapping(address token => SupportedToken) public supportedTokens;
    
    // Маппинг для хранения nonce каждого пользователя
    mapping(address user => uint256) public nonces;

    // Переменные для хранения информации о домене
    bytes32 public DOMAIN_SEPARATOR;

    // Событие, вызываемое при успешном выполнении мета-транзакции
    event MetaTransactionExecuted(
        address indexed userAddress,
        address indexed relayerAddress,
        address tokenAddress,
        uint256 amount,
        uint256 fee
    );

    // Конструктор контракта, устанавливающий владельца
    constructor() {
        owner = msg.sender;

        // Инициализация DOMAIN_SEPARATOR
        uint256 chainId;
        assembly {
            chainId := chainid()
        }

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("ERC20Forwarder")),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    // Модификатор для ограничения доступа только для владельца
    modifier onlyOwner() {
        require(msg.sender == owner, "ERC20Forwarder: Only owner can call this function");
        _;
    }

    // Добавление токена в список поддерживаемых
    function addSupportedToken(address tokenAddress, uint256 minAmount) public onlyOwner {
        supportedTokens[tokenAddress]._tokenSupported = true;
        supportedTokens[tokenAddress]._minAmount = minAmount;
    }

    // Удаление токена из списка поддерживаемых
    function removeSupportedToken(address tokenAddress) public onlyOwner {
        supportedTokens[tokenAddress]._tokenSupported = false;
        supportedTokens[tokenAddress]._minAmount = 0;
    }

    // Верификация подписи пользователя
    function verify(
        address user,
        address tokenAddress,
        address recipient,
        uint256 amount,
        uint256 nonce,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) public view returns (bool) {
        require(
            supportedTokens[tokenAddress]._tokenSupported,
            "ERC20Forwarder: Token not supported"
        );

        require(
            amount >= supportedTokens[tokenAddress]._minAmount,
            "ERC20Forwarder: Amount is less than the minimum required"
        );

        // Формирование хэша данных
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("MetaTransaction(address tokenAddress,address recipient,uint256 amount,uint256 nonce,address user)"),
                tokenAddress,
                recipient,
                amount,
                nonce,
                user
            )
        );

        // Формирование хэша сообщения согласно EIP-712
        bytes32 hash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        // Восстановление адреса подписанта и его сравнение с адресом пользователя
        return user == ECDSA.recover(hash, sigV, sigR, sigS);
    }

    // Проверка достаточности переданного газа для выполнения вызова
    function _checkForwardedGas(uint256 gasLeft, uint256 reqGas) private pure {
        // Проверяем, что переданный газ достаточно велик
        if (gasLeft < (reqGas * 63) / 64) {
            // Если газа недостаточно, транзакция отменяется с помощью команды invalid
            assembly {
                invalid()
            }
        }
    }

    // Выполнение мета-транзакции с учетом комиссии и использованием permit
    function executeMetaTransaction(
        address user,
        address tokenAddress,
        address recipient,
        uint256 amount,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) public payable {
        // Используем permit для разрешения на выполнение transferFrom без approve
        IERC20(tokenAddress).permit(user, address(this), amount, deadline, permitV, permitR, permitS);

        // Верификация подписи пользователя
        require(
            IERC20(tokenAddress).allowance(user, address(this)) >= amount,
            "ERC20Forwarder: problem with allowance"
        );
        
        // Инкрементируем nonce пользователя
        uint256 nonce = nonces[user];
        nonces[user] += 1;    

        // Верификация подписи пользователя
        require(
            verify(user, tokenAddress, recipient, amount, nonce, sigR, sigS, sigV),
            "ERC20Forwarder: signature does not match"
        );


        uint256 initialGas = gasleft();

        // Рассчитываем комиссию
        uint256 fee = (amount * feePercent) / 100;
        uint256 amountAfterFee = amount - fee;

        // Переводим токены на адрес получателя за вычетом комиссии
        require(
            IERC20(tokenAddress).transferFrom(user, recipient, amountAfterFee),
            "ERC20Forwarder: Transfer failed"
        );

        // Переводим комиссию на адрес ретранслятора (owner)
        require(
            IERC20(tokenAddress).transferFrom(user, owner, fee),
            "ERC20Forwarder: Fee transfer failed"
        );

        // Проверяем, что переданный газ достаточен для выполнения вызова
        _checkForwardedGas(initialGas, gasleft());

        emit MetaTransactionExecuted(user, msg.sender, tokenAddress, amount, fee);
    }
}