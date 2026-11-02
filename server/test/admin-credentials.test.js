import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CredentialUpdateError,
  parseCredentialUpdate,
  updateAdminCredentials
} from '../scripts/admin-credentials.js';

const validInput = {
  currentEmail: ' OLD.ADMIN@example.com ',
  newEmail: ' New.Admin@example.com ',
  newPassword: 'StrongPass123!',
  passwordConfirmation: 'StrongPass123!'
};

describe('admin credential update validation', () => {
  it('normalizes email addresses and leaves passwords unchanged', () => {
    assert.deepEqual(parseCredentialUpdate(validInput), {
      currentEmail: 'old.admin@example.com',
      newEmail: 'new.admin@example.com',
      newPassword: 'StrongPass123!',
      passwordConfirmation: 'StrongPass123!'
    });
  });

  it('rejects invalid emails, weak passwords, overlong bcrypt input, and mismatches', () => {
    for (const input of [
      { ...validInput, currentEmail: 'not-an-email' },
      { ...validInput, newEmail: 'bad-email' },
      { ...validInput, newPassword: 'short' },
      { ...validInput, newPassword: 'AllLettersOnly' },
      { ...validInput, newPassword: `StrongPass123!${'x'.repeat(60)}` },
      { ...validInput, passwordConfirmation: 'DifferentPass123!' }
    ]) {
      assert.throws(() => parseCredentialUpdate(input), CredentialUpdateError);
    }
  });
});

describe('admin credential update transaction', () => {
  it('updates the locked admin and deletes only sessions containing that admin ID', async () => {
    const calls = [];
    const connection = {
      async beginTransaction() {
        calls.push(['begin']);
      },
      async execute(sql, values) {
        calls.push(['execute', sql, values]);
        if (sql.startsWith('SELECT id FROM admins WHERE email = ? LIMIT 1')) {
          return [[{ id: 17 }]];
        }
        if (sql.startsWith('SELECT id FROM admins WHERE email = ? AND id <> ?')) {
          return [[]];
        }
        if (sql.startsWith('UPDATE admins')) {
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('DELETE FROM admin_sessions')) {
          return [{ affectedRows: 2 }];
        }
        throw new Error('Unexpected SQL in test double.');
      },
      async commit() {
        calls.push(['commit']);
      },
      async rollback() {
        calls.push(['rollback']);
      }
    };

    const result = await updateAdminCredentials(connection, {
      currentEmail: 'old@example.com',
      newEmail: 'new@example.com',
      passwordHash: 'test-hash'
    });

    assert.deepEqual(result, { sessionsInvalidated: 2 });
    assert.deepEqual(calls.map(([operation]) => operation), [
      'begin', 'execute', 'execute', 'execute', 'execute', 'commit'
    ]);
    assert.deepEqual(calls[3][2], ['new@example.com', 'test-hash', 17]);
    assert.deepEqual(calls[4][2], ['17']);
    assert.match(calls[4][1], /JSON_EXTRACT\(session_data, '\$\.adminId'\)/);
    assert.equal(calls.some(([operation]) => operation === 'rollback'), false);
  });

  it('rolls back without changing data when the current account does not exist', async () => {
    const calls = [];
    const connection = {
      async beginTransaction() {
        calls.push('begin');
      },
      async execute() {
        return [[]];
      },
      async commit() {
        calls.push('commit');
      },
      async rollback() {
        calls.push('rollback');
      }
    };

    await assert.rejects(
      updateAdminCredentials(connection, {
        currentEmail: 'missing@example.com',
        newEmail: 'new@example.com',
        passwordHash: 'test-hash'
      }),
      /No administrator account matches/
    );
    assert.deepEqual(calls, ['begin', 'rollback']);
  });

  it('rolls back if the new email belongs to another admin', async () => {
    const calls = [];
    const connection = {
      async beginTransaction() {
        calls.push('begin');
      },
      async execute(sql) {
        if (sql.startsWith('SELECT id FROM admins WHERE email = ? LIMIT 1')) return [[{ id: 17 }]];
        if (sql.startsWith('SELECT id FROM admins WHERE email = ? AND id <> ?')) return [[{ id: 18 }]];
        throw new Error('Unexpected SQL in test double.');
      },
      async commit() {
        calls.push('commit');
      },
      async rollback() {
        calls.push('rollback');
      }
    };

    await assert.rejects(
      updateAdminCredentials(connection, {
        currentEmail: 'old@example.com',
        newEmail: 'taken@example.com',
        passwordHash: 'test-hash'
      }),
      /already assigned/
    );
    assert.deepEqual(calls, ['begin', 'rollback']);
  });
});
