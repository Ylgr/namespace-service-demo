//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

interface IBICRegistrarController {
    struct Price {
        uint256 base;
        uint256 premium;
    }

    function rentPrice(string memory, uint256)
    external
    returns (Price memory);

    function available(string memory) external returns (bool);

    function makeCommitment(
        string memory,
        address,
        uint256,
        bytes32,
        address,
        bytes[] calldata,
        bool,
        uint32,
        uint64
    ) external returns (bytes32);

    function commit(bytes32) external;

    function register(
        string memory,
        address,
        uint256,
        bytes32,
        address,
        bytes[] calldata,
        bool,
        uint32,
        uint64,
        uint256
    ) external;

    function renew(string calldata, uint256, uint256) external;
}
