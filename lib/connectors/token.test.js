import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from '../db.js';
import { issueToken, checkToken, revokeToken, tokenStatus } from './token.js';

test('a token works once made, only as a bearer token, and a new one replaces it', () => {
  const db = memoryDb();
  assert.equal(tokenStatus(db).on, false);
  const token = issueToken(db);
  assert.match(token, /^myth_[A-Za-z0-9_-]{32}$/);
  assert.equal(checkToken(db, 'Bearer ' + token), true);
  assert.equal(checkToken(db, token), false);
  assert.equal(checkToken(db, 'Bearer ' + token + 'x'), false);
  assert.equal(tokenStatus(db).hint, token.slice(-4));
  const next = issueToken(db);
  assert.equal(checkToken(db, 'Bearer ' + token), false);
  assert.equal(checkToken(db, 'Bearer ' + next), true);
  revokeToken(db);
  assert.equal(checkToken(db, 'Bearer ' + next), false);
  assert.equal(tokenStatus(db).on, false);
});

test('only a hash of the token is stored', () => {
  const db = memoryDb();
  const token = issueToken(db);
  const stored = db.prepare("SELECT json FROM dash_settings WHERE key = 'api_token'").get().json;
  assert.equal(stored.includes(token), false);
});
