// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./IERC20Metadata.sol";
import "./IERC20.sol";
import "./AccessControl.sol";
import "./Errors.sol";

contract MyERC20Token is IERC20, IERC20Metadata, MyAccessControlContract {

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    mapping(address => uint256) public nonces;

    uint256 private _totalSupply;
    string private _name;
    string private _symbol;
    uint8 private _decimals;

    bytes32 public immutable DOMAIN_SEPARATOR;
	bytes32 public constant PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name_)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // Инициализация для Beacon
    function initialize(string memory name_, string memory symbol_, uint8 decimals_) public {
        require(bytes(_name).length == 0 && bytes(_symbol).length == 0, "Already initialized");
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // Пример действия которое может совершить только администратор
    function mint(address account, uint256 amount) public onlyRole(ADMIN_ROLE) {
        _mint(account, amount);
    }

    // Пример действия которое может совершить только администратор
    function withdrawETH() public onlyRole(ADMIN_ROLE) {
        require(address(this).balance > 0, WithdrawAmountZero(msg.sender));
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, ETHWithdrawError(msg.sender));
    }

    // Пример действия которое может совершить только пользователь с ролью
    function buyTokens() public payable onlyRole(USER_ROLE) {
        require(msg.value > 0, DepositAmountZero(msg.sender));
        _mint(msg.sender, msg.value);
    }

    function name() public view virtual returns (string memory) {
        return _name;
    }

    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view virtual returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        address spender = msg.sender;
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

	function permit(
		address owner,
		address spender,
		uint256 value,
		uint256 deadline,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external {
		require(deadline >= block.timestamp, "ERC20Permit: expired deadline");

		bytes32 structHash = keccak256(
			abi.encode(
				PERMIT_TYPEHASH,
				owner,
				spender,
				value,
				nonces[owner]++,
				deadline
			)
		);

		bytes32 hash = keccak256(
			abi.encodePacked(
				"\x19\x01",
				DOMAIN_SEPARATOR,
				structHash
			)
		);

		address signer = ecrecover(hash, v, r, s);
		require(signer != address(0) && signer == owner, "ERC20Permit: invalid signature");

		_approve(owner, spender, value);
	}

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0) && to != address(0), "ERC20: transfer from/to the zero address");

        uint256 fromBalance = _balances[from];
        require(fromBalance >= amount, "ERC20: transfer amount exceeds balance");

        unchecked {
            _balances[from] = fromBalance - amount;
        }
        _balances[to] += amount;

        emit Transfer(from, to, amount);
    }

    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: mint to the zero address");

        _totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: burn from the zero address");

        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");

        unchecked {
            _balances[account] = accountBalance - amount;
        }
        _totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _spendAllowance(address owner, address spender, uint256 amount) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }
}
