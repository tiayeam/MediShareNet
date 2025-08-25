// tests/MSHTokenContract.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface MintRecord {
  amount: number;
  recipient: string;
  metadata: string;
  timestamp: number;
}

interface ContractState {
  balances: Map<string, number>;
  minters: Map<string, boolean>;
  mintRecords: Map<number, MintRecord>;
  totalSupply: number;
  paused: boolean;
  admin: string;
  mintCounter: number;
  transferRestrictions: Map<string, boolean>;
}

// Mock contract implementation
class MSHTokenContractMock {
  private state: ContractState = {
    balances: new Map([["contract-owner", 1000000]]),
    minters: new Map(),
    mintRecords: new Map(),
    totalSupply: 1000000,
    paused: false,
    admin: "contract-owner",
    mintCounter: 0,
    transferRestrictions: new Map(),
  };

  private MAX_METADATA_LEN = 500;
  private MAX_SUPPLY = 1000000000000;
  private ERR_NOT_AUTHORIZED = 100;
  private ERR_PAUSED = 101;
  private ERR_INVALID_AMOUNT = 102;
  private ERR_INVALID_RECIPIENT = 103;
  private ERR_INVALID_MINTER = 104;
  private ERR_ALREADY_REGISTERED = 105;
  private ERR_METADATA_TOO_LONG = 106;
  private ERR_TRANSFER_RESTRICTED = 107;
  private ERR_SUPPLY_CAP_EXCEEDED = 108;
  private ERR_NOT_ENOUGH_BALANCE = 109;

  getName(): ClarityResponse<string> {
    return { ok: true, value: "MediShareNet Token" };
  }

  getSymbol(): ClarityResponse<string> {
    return { ok: true, value: "MSH" };
  }

  getDecimals(): ClarityResponse<number> {
    return { ok: true, value: 6 };
  }

  getTotalSupply(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getBalance(account: string): ClarityResponse<number> {
    return { ok: true, value: this.state.balances.get(account) ?? 0 };
  }

  getMintRecord(id: number): ClarityResponse<MintRecord | null> {
    return { ok: true, value: this.state.mintRecords.get(id) ?? null };
  }

  isMinter(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.minters.get(account) ?? false };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getTransferRestriction(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.transferRestrictions.get(account) ?? false };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  addMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (this.state.minters.has(minter)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    this.state.minters.set(minter, true);
    return { ok: true, value: true };
  }

  removeMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.minters.set(minter, false);
    return { ok: true, value: true };
  }

  mint(caller: string, amount: number, recipient: string, metadata: string): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.state.minters.get(caller)) {
      return { ok: false, value: this.ERR_INVALID_MINTER };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (recipient === "contract-owner") {
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    if (metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_METADATA_TOO_LONG };
    }
    if (this.state.totalSupply + amount > this.MAX_SUPPLY) {
      return { ok: false, value: this.ERR_SUPPLY_CAP_EXCEEDED };
    }
    const currentBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalSupply += amount;
    const id = this.state.mintCounter + 1;
    this.state.mintRecords.set(id, {
      amount,
      recipient,
      metadata,
      timestamp: Date.now(),
    });
    this.state.mintCounter = id;
    return { ok: true, value: id };
  }

  transfer(caller: string, amount: number, sender: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== sender) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (this.state.transferRestrictions.get(sender) ?? false) {
      return { ok: false, value: this.ERR_TRANSFER_RESTRICTED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (recipient === "contract-owner") {
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    const senderBalance = this.state.balances.get(sender) ?? 0;
    if (senderBalance < amount) {
      return { ok: false, value: this.ERR_NOT_ENOUGH_BALANCE };
    }
    this.state.balances.set(sender, senderBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    return { ok: true, value: true };
  }

  burn(caller: string, amount: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const senderBalance = this.state.balances.get(caller) ?? 0;
    if (senderBalance < amount) {
      return { ok: false, value: this.ERR_NOT_ENOUGH_BALANCE };
    }
    this.state.balances.set(caller, senderBalance - amount);
    this.state.totalSupply -= amount;
    return { ok: true, value: true };
  }

  setTransferRestriction(caller: string, account: string, restricted: boolean): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.transferRestrictions.set(account, restricted);
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  owner: "contract-owner",
  admin: "wallet_admin",
  minter: "wallet_minter",
  user1: "wallet_user1",
  user2: "wallet_user2",
};

describe("MSHTokenContract", () => {
  let contract: MSHTokenContractMock;

  beforeEach(() => {
    contract = new MSHTokenContractMock();
  });

  it("should initialize with correct token metadata and initial supply", () => {
    expect(contract.getName()).toEqual({ ok: true, value: "MediShareNet Token" });
    expect(contract.getSymbol()).toEqual({ ok: true, value: "MSH" });
    expect(contract.getDecimals()).toEqual({ ok: true, value: 6 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1000000 });
    expect(contract.getBalance(accounts.owner)).toEqual({ ok: true, value: 1000000 });
  });

  it("should allow admin to set new admin", () => {
    const setAdmin = contract.setAdmin(accounts.owner, accounts.admin);
    expect(setAdmin).toEqual({ ok: true, value: true });
  });

  it("should prevent non-admin from setting admin", () => {
    const setAdmin = contract.setAdmin(accounts.user1, accounts.admin);
    expect(setAdmin).toEqual({ ok: false, value: 100 });
  });

  it("should allow admin to add minter", () => {
    const addMinter = contract.addMinter(accounts.owner, accounts.minter);
    expect(addMinter).toEqual({ ok: true, value: true });
    expect(contract.isMinter(accounts.minter)).toEqual({ ok: true, value: true });
  });

  it("should prevent adding duplicate minter", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    const addDuplicate = contract.addMinter(accounts.owner, accounts.minter);
    expect(addDuplicate).toEqual({ ok: false, value: 105 });
  });

  it("should allow minter to mint tokens with metadata", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    const mintResult = contract.mint(accounts.minter, 500000, accounts.user1, "Reward for data submission");
    expect(mintResult).toEqual({ ok: true, value: 1 });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1500000 });
    const mintRecord = contract.getMintRecord(1);
    expect(mintRecord).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: 500000,
        recipient: accounts.user1,
        metadata: "Reward for data submission",
      }),
    });
  });

  it("should prevent minting when paused", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    contract.pauseContract(accounts.owner);
    const mintResult = contract.mint(accounts.minter, 1000, accounts.user1, "Paused mint");
    expect(mintResult).toEqual({ ok: false, value: 101 });
  });

  it("should prevent minting with invalid amount", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    const mintResult = contract.mint(accounts.minter, 0, accounts.user1, "Invalid amount");
    expect(mintResult).toEqual({ ok: false, value: 102 });
  });

  it("should prevent minting exceeding supply cap", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    const largeAmount = 1000000000000; // Exceeds after initial 1M
    const mintResult = contract.mint(accounts.minter, largeAmount, accounts.user1, "Too much");
    expect(mintResult).toEqual({ ok: false, value: 108 });
  });

  it("should allow token transfer", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    contract.mint(accounts.minter, 100000, accounts.user1, "Test mint");
    const transferResult = contract.transfer(accounts.user1, 50000, accounts.user1, accounts.user2);
    expect(transferResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 50000 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 50000 });
  });

  it("should prevent transfer when restricted", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    contract.mint(accounts.minter, 100000, accounts.user1, "Test mint");
    contract.setTransferRestriction(accounts.owner, accounts.user1, true);
    const transferResult = contract.transfer(accounts.user1, 50000, accounts.user1, accounts.user2);
    expect(transferResult).toEqual({ ok: false, value: 107 });
  });

  it("should allow burning tokens", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    contract.mint(accounts.minter, 100000, accounts.user1, "Test mint");
    const burnResult = contract.burn(accounts.user1, 30000);
    expect(burnResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 70000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1070000 });
  });

  it("should prevent burning more than balance", () => {
    contract.addMinter(accounts.owner, accounts.minter);
    contract.mint(accounts.minter, 100000, accounts.user1, "Test mint");
    const burnResult = contract.burn(accounts.user1, 200000);
    expect(burnResult).toEqual({ ok: false, value: 109 });
  });
});