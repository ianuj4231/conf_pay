CREATE DATABASE IF NOT EXISTS account_transactions;
USE account_transactions;

CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  balance DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT chk_accounts_balance_nonnegative CHECK (balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  type ENUM('credit', 'debit') NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  description VARCHAR(1000) NULL,
  reference_id VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0),
  CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT uq_transactions_account_reference UNIQUE (account_id, reference_id),
  INDEX idx_transactions_account_created (account_id, created_at DESC, id DESC),
  INDEX idx_transactions_account_type_created (account_id, type, created_at DESC, id DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transfers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_account_id BIGINT UNSIGNED NOT NULL,
  to_account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  reference_id VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT chk_transfers_different_accounts CHECK (from_account_id <> to_account_id),
  CONSTRAINT chk_transfers_amount_positive CHECK (amount > 0),
  CONSTRAINT fk_transfers_from_account FOREIGN KEY (from_account_id) REFERENCES accounts(id),
  CONSTRAINT fk_transfers_to_account FOREIGN KEY (to_account_id) REFERENCES accounts(id),
  CONSTRAINT uq_transfers_reference UNIQUE (reference_id),
  INDEX idx_transfers_from_account (from_account_id, created_at DESC, id DESC),
  INDEX idx_transfers_to_account (to_account_id, created_at DESC, id DESC)
) ENGINE=InnoDB;
