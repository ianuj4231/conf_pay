const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

function isPositiveInteger(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0;
}

function parseAmount(value) {
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return null;
  }

  if (!/^\d+(\.\d{1,4})?$/.test(text)) return null;

  const [wholePart, fractionPart = ''] = text.split('.');
  const whole = BigInt(wholePart);
  const fraction = fractionPart.padEnd(4, '0');
  if (whole === 0n && BigInt(fraction) === 0n) return null;

  return `${whole.toString()}.${fraction}`;
}

function validAccountId(value) {
  return isPositiveInteger(value);
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/accounts', async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Account name is required' });

  try {
    const [result] = await pool.execute('INSERT INTO accounts (name) VALUES (?)', [name]);
    const [rows] = await pool.execute(
      'SELECT id, name, balance, created_at, updated_at FROM accounts WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

app.get('/accounts/:accountId/balance', async (req, res, next) => {
  if (!validAccountId(req.params.accountId)) {
    return res.status(400).json({ error: 'Invalid account ID' });
  }
  try {
    const [rows] = await pool.execute(
      'SELECT id AS account_id, balance FROM accounts WHERE id = ?',
      [req.params.accountId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Account not found' });
    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

app.post('/accounts/:accountId/transactions', async (req, res, next) => {
  const { accountId } = req.params;
  const { type, amount, description, reference_id: referenceId } = req.body || {};
  const parsedAmount = parseAmount(amount);

  if (!validAccountId(accountId)) return res.status(400).json({ error: 'Invalid account ID' });
  if (!['credit', 'debit'].includes(type)) {
    return res.status(400).json({ error: 'Transaction type must be credit or debit' });
  }
  if (parsedAmount === null) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (typeof referenceId !== 'string' || !referenceId.trim()) {
    return res.status(400).json({ error: 'reference_id is required' });
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({ error: 'Description must be a string' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      `SELECT id, account_id, type, amount, description, reference_id, created_at
       FROM transactions WHERE account_id = ? AND reference_id = ?`,
      [accountId, referenceId.trim()]
    );
    if (existing.length) {
      const [accountRows] = await connection.execute(
        'SELECT id AS account_id, balance FROM accounts WHERE id = ?',
        [accountId]
      );
      await connection.rollback();
      return res.status(409).json({
        duplicate: true,
        transaction: existing[0],
        balance: accountRows[0]?.balance ?? null,
        error: 'Transaction with this reference_id already exists'
      });
    }

    const [accountRows] = await connection.execute(
      'SELECT id FROM accounts WHERE id = ? FOR UPDATE',
      [accountId]
    );
    if (!accountRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Account not found' });
    }

    let balanceUpdate;
    if (type === 'credit') {
      [balanceUpdate] = await connection.execute(
        `UPDATE accounts
         SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP(6)
         WHERE id = ?`,
        [parsedAmount, accountId]
      );
    } else {
      [balanceUpdate] = await connection.execute(
        `UPDATE accounts
         SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP(6)
         WHERE id = ? AND balance >= ?`,
        [parsedAmount, accountId, parsedAmount]
      );
      if (balanceUpdate.affectedRows === 0) {
        await connection.rollback();
        return res.status(409).json({ error: 'Insufficient balance' });
      }
    }

    const [insertResult] = await connection.execute(
      `INSERT INTO transactions (account_id, type, amount, description, reference_id)
       VALUES (?, ?, ?, ?, ?)`,
      [accountId, type, parsedAmount, description ?? null, referenceId.trim()]
    );
    const [transactionRows] = await connection.execute(
      `SELECT id, account_id, type, amount, description, reference_id, created_at
       FROM transactions WHERE id = ?`,
      [insertResult.insertId]
    );
    const [updatedAccountRows] = await connection.execute(
      'SELECT balance FROM accounts WHERE id = ?',
      [accountId]
    );

    await connection.commit();
    return res.status(201).json({
      duplicate: false,
      transaction: transactionRows[0],
      balance: updatedAccountRows[0].balance
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) { /* connection cleanup follows */ }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Transaction with this reference_id already exists' });
    }
    return next(error);
  } finally {
    connection.release();
  }
});

app.get('/accounts/:accountId/transactions', async (req, res, next) => {
  const { accountId } = req.params;
  const { type } = req.query;
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);

  if (!validAccountId(accountId)) return res.status(400).json({ error: 'Invalid account ID' });
  if (type !== undefined && !['credit', 'debit'].includes(type)) {
    return res.status(400).json({ error: 'type must be credit or debit' });
  }
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'page must be positive and limit must be between 1 and 100' });
  }

  try {
    const [accountRows] = await pool.execute('SELECT id FROM accounts WHERE id = ?', [accountId]);
    if (!accountRows.length) return res.status(404).json({ error: 'Account not found' });

    const filters = ['account_id = ?'];
    const params = [accountId];
    if (type !== undefined) {
      filters.push('type = ?');
      params.push(type);
    }
    const where = filters.join(' AND ');
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM transactions WHERE ${where}`, params);
    const totalRecords = Number(countRows[0].total);
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT id, account_id, type, amount, description, reference_id, created_at
       FROM transactions WHERE ${where}
       ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    return res.json({
      current_page: page,
      page_size: limit,
      total_records: totalRecords,
      total_pages: Math.ceil(totalRecords / limit),
      transactions: rows
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/transfers', async (req, res, next) => {
  const { from_account_id: fromAccountId, to_account_id: toAccountId, amount, reference_id: referenceId } = req.body || {};
  const parsedAmount = parseAmount(amount);

  if (!validAccountId(fromAccountId) || !validAccountId(toAccountId)) {
    return res.status(400).json({ error: 'Both account IDs must be valid positive integers' });
  }
  if (String(fromAccountId) === String(toAccountId)) {
    return res.status(400).json({ error: 'Source and destination accounts must be different' });
  }
  if (parsedAmount === null) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (typeof referenceId !== 'string' || !referenceId.trim()) {
    return res.status(400).json({ error: 'reference_id is required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      `SELECT id, from_account_id, to_account_id, amount, reference_id, created_at
       FROM transfers WHERE reference_id = ?`,
      [referenceId.trim()]
    );
    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({
        duplicate: true,
        transfer: existing[0],
        error: 'Transfer with this reference_id already exists'
      });
    }

    // Lock both accounts explicitly in ascending ID order. This makes concurrent
    // opposite-direction transfers acquire locks in the same order.
    const accountIds = [Number(fromAccountId), Number(toAccountId)].sort((a, b) => a - b);
    const lockedAccounts = [];
    for (const accountId of accountIds) {
      const [rows] = await connection.execute(
        'SELECT id FROM accounts WHERE id = ? FOR UPDATE',
        [accountId]
      );
      if (rows.length) lockedAccounts.push(rows[0]);
    }
    if (lockedAccounts.length !== 2) {
      await connection.rollback();
      return res.status(404).json({ error: 'One or both accounts were not found' });
    }

    const [senderUpdate] = await connection.execute(
      `UPDATE accounts
       SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP(6)
       WHERE id = ? AND balance >= ?`,
      [parsedAmount, fromAccountId, parsedAmount]
    );
    if (senderUpdate.affectedRows === 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Insufficient balance' });
    }

    await connection.execute(
      `UPDATE accounts
       SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP(6)
       WHERE id = ?`,
      [parsedAmount, toAccountId]
    );
    await connection.execute(
      `INSERT INTO transfers (from_account_id, to_account_id, amount, reference_id)
       VALUES (?, ?, ?, ?)`,
      [fromAccountId, toAccountId, parsedAmount, referenceId.trim()]
    );
    await connection.execute(
      `INSERT INTO transactions (account_id, type, amount, description, reference_id)
       VALUES (?, 'debit', ?, ?, ?), (?, 'credit', ?, ?, ?)`,
      [fromAccountId, parsedAmount, `Transfer to account ${toAccountId}`, referenceId.trim(),
        toAccountId, parsedAmount, `Transfer from account ${fromAccountId}`, referenceId.trim()]
    );
    const [updatedAccountRows] = await connection.execute(
      'SELECT id, balance FROM accounts WHERE id IN (?, ?) ORDER BY id',
      [fromAccountId, toAccountId]
    );
    const updatedBalances = new Map(
      updatedAccountRows.map((account) => [String(account.id), account.balance])
    );

    await connection.commit();
    return res.status(201).json({
      duplicate: false,
      transfer: {
        from_account_id: Number(fromAccountId),
        to_account_id: Number(toAccountId),
        amount: parsedAmount,
        reference_id: referenceId.trim()
      },
      balances: {
        from_account_id: updatedBalances.get(String(fromAccountId)),
        to_account_id: updatedBalances.get(String(toAccountId))
      }
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) { /* connection cleanup follows */ }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Transfer with this reference_id already exists' });
    }
    return next(error);
  } finally {
    connection.release();
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
