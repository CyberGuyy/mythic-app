import test from 'node:test';
import assert from 'node:assert/strict';
import { newSession, validSession, checkPassword, isLocalHost, password, SESSION_DAYS } from './auth.js';

const env = { MYTHIC_PASSWORD: 'correct horse battery staple' };

test('only localhost names count as this machine', () => {
  for (const host of ['localhost', 'localhost:3000', '127.0.0.1:3000', '[::1]:3000']) assert.equal(isLocalHost(host), true, host);
  for (const host of ['192.168.1.5:3000', 'mythic.example.com', 'localhost.evil.com', '', null]) assert.equal(isLocalHost(host), false, String(host));
});

test('a session signed with the password is valid until it expires', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const session = newSession(now, env);
  assert.equal(validSession(session, now + 1000, env), true);
  assert.equal(validSession(session, now + (SESSION_DAYS + 1) * 86400000, env), false);
});

test('a session from another password, or a tampered one, is refused', () => {
  const now = Date.now();
  const session = newSession(now, env);
  assert.equal(validSession(session, now, { MYTHIC_PASSWORD: 'other' }), false);
  const [issued, signature] = session.split('.');
  assert.equal(validSession(String(Number(issued) + 1) + '.' + signature, now, env), false);
  assert.equal(validSession('', now, env), false);
  assert.equal(validSession('garbage', now, env), false);
});

test('the password check', () => {
  assert.equal(checkPassword('correct horse battery staple', env), true);
  assert.equal(checkPassword('wrong', env), false);
  assert.equal(checkPassword('anything', {}), false);
  assert.equal(password({}), null);
  assert.equal(password({ MYTHIC_PASSWORD: '' }), null);
});
