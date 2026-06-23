// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ConfidentialUSDC} from "./ConfidentialUSDC.sol";

/// @title  PayrollVault
/// @notice Lets an employer pay many employees in one run where no employee can
///         see another's salary. Every salary stays an encrypted `euint64` for
///         its entire lifecycle. Built on cUSDC.
contract PayrollVault is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    ConfidentialUSDC public cusdc;

    struct PayrollTemplate {
        address employer;
        address[] employees;
        bool active;
        uint256 createdAt;
    }

    struct PayrollRun {
        uint256 templateId;
        mapping(address => euint64) salaries; // encrypted per employee
        euint64 total; // encrypted sum of all salaries
        euint64 fundedAmount; // encrypted amount actually pulled in
        bool funded;
        bool executed;
        bool cancelled;
        uint256 executedAt;
    }

    uint256 public templateCount;
    uint256 public runCount;
    mapping(uint256 => PayrollTemplate) private _templates;
    mapping(uint256 => PayrollRun) private _runs;

    /// @notice Encrypted amount each employee can claim across all executed runs.
    mapping(address => euint64) private _pendingClaims;

    event TemplateCreated(uint256 indexed templateId, address indexed employer);
    event RunCreated(uint256 indexed runId, uint256 indexed templateId);
    event RunFunded(uint256 indexed runId);
    event RunExecuted(uint256 indexed runId);
    event RunCancelled(uint256 indexed runId);
    event Claimed(address indexed employee);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address cusdcAddress, address owner_) public initializer {
        require(cusdcAddress != address(0), "cusdc=0");
        __Ownable_init(owner_);
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());
        cusdc = ConfidentialUSDC(cusdcAddress);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // -------------------------------------------------------------------------

    /// @notice Create a payroll template with a fixed set of employees.
    function createTemplate(address[] calldata employees) external returns (uint256 templateId) {
        require(employees.length > 0, "no employees");
        templateId = ++templateCount;
        PayrollTemplate storage t = _templates[templateId];
        t.employer = msg.sender;
        t.employees = employees;
        t.active = true;
        t.createdAt = block.timestamp;
        emit TemplateCreated(templateId, msg.sender);
    }

    /// @notice Submit one encrypted salary per employee for a new run.
    /// @dev Each employee is granted ACL on their own salary only.
    function createRun(
        uint256 templateId,
        externalEuint64[] calldata salaries,
        bytes[] calldata proofs
    ) external returns (uint256 runId) {
        PayrollTemplate storage t = _templates[templateId];
        require(t.employer == msg.sender, "not employer");
        require(t.active, "inactive template");
        require(salaries.length == t.employees.length, "length mismatch");
        require(proofs.length == salaries.length, "proofs mismatch");

        runId = ++runCount;
        PayrollRun storage r = _runs[runId];
        r.templateId = templateId;

        euint64 total = FHE.asEuint64(0);
        for (uint256 i = 0; i < t.employees.length; i++) {
            address emp = t.employees[i];
            euint64 s = FHE.fromExternal(salaries[i], proofs[i]);
            r.salaries[emp] = s;
            total = FHE.add(total, s);

            FHE.allowThis(s);
            FHE.allow(s, msg.sender); // employer
            FHE.allow(s, emp); // employee sees only their own salary
        }

        r.total = total;
        FHE.allowThis(total);
        FHE.allow(total, msg.sender);
        emit RunCreated(runId, templateId);
    }

    /// @notice Pull the run's total cUSDC from the employer into the vault.
    /// @dev Employer must first `cusdc.approve(payrollVault, >= total)`.
    function fundRun(uint256 runId) external {
        PayrollRun storage r = _runs[runId];
        PayrollTemplate storage t = _templates[r.templateId];
        require(t.employer == msg.sender, "not employer");
        require(!r.funded && !r.cancelled, "bad state");

        FHE.allowTransient(r.total, address(cusdc));
        euint64 moved = cusdc.transferFrom(msg.sender, address(this), r.total);

        r.fundedAmount = moved;
        r.funded = true;
        FHE.allowThis(r.fundedAmount);
        FHE.allow(r.fundedAmount, msg.sender);
        emit RunFunded(runId);
    }

    /// @notice Credit each employee's encrypted pending claim.
    function executeRun(uint256 runId) external {
        PayrollRun storage r = _runs[runId];
        PayrollTemplate storage t = _templates[r.templateId];
        require(t.employer == msg.sender, "not employer");
        require(r.funded, "not funded");
        require(!r.executed && !r.cancelled, "bad state");

        for (uint256 i = 0; i < t.employees.length; i++) {
            address emp = t.employees[i];
            euint64 acc = FHE.add(_pendingClaims[emp], r.salaries[emp]);
            _pendingClaims[emp] = acc;
            FHE.allowThis(acc);
            FHE.allow(acc, emp);
        }

        r.executed = true;
        r.executedAt = block.timestamp;
        emit RunExecuted(runId);
    }

    /// @notice Employee pulls their accumulated pending claim into their cUSDC balance.
    function claim() external {
        euint64 amount = _pendingClaims[msg.sender];
        FHE.allowTransient(amount, address(cusdc));
        cusdc.transfer(msg.sender, amount);

        euint64 zero = FHE.asEuint64(0);
        _pendingClaims[msg.sender] = zero;
        FHE.allowThis(zero);
        FHE.allow(zero, msg.sender);
        emit Claimed(msg.sender);
    }

    /// @notice Employer cancels an unexecuted run; funded cUSDC is returned.
    function cancelRun(uint256 runId) external {
        PayrollRun storage r = _runs[runId];
        PayrollTemplate storage t = _templates[r.templateId];
        require(t.employer == msg.sender, "not employer");
        require(!r.executed && !r.cancelled, "bad state");

        if (r.funded) {
            FHE.allowTransient(r.fundedAmount, address(cusdc));
            cusdc.transfer(t.employer, r.fundedAmount);
        }
        r.cancelled = true;
        emit RunCancelled(runId);
    }

    // -------------------------------------------------------------------------
    // Views (caller needs ACL to decrypt the returned handles)
    // -------------------------------------------------------------------------

    function getEmployees(uint256 templateId) external view returns (address[] memory) {
        return _templates[templateId].employees;
    }

    function getTemplate(uint256 templateId)
        external
        view
        returns (address employer, bool active, uint256 createdAt, uint256 employeeCount)
    {
        PayrollTemplate storage t = _templates[templateId];
        return (t.employer, t.active, t.createdAt, t.employees.length);
    }

    function getRunStatus(uint256 runId)
        external
        view
        returns (uint256 templateId, bool funded, bool executed, bool cancelled, uint256 executedAt)
    {
        PayrollRun storage r = _runs[runId];
        return (r.templateId, r.funded, r.executed, r.cancelled, r.executedAt);
    }

    /// @notice Encrypted salary of `employee` in `runId`.
    function salaryOf(uint256 runId, address employee) external view returns (euint64) {
        return _runs[runId].salaries[employee];
    }

    /// @notice Encrypted total of a run.
    function runTotal(uint256 runId) external view returns (euint64) {
        return _runs[runId].total;
    }

    /// @notice Encrypted pending (unclaimed) amount for an employee.
    function pendingClaim(address employee) external view returns (euint64) {
        return _pendingClaims[employee];
    }
}
