const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOrThrow, signupSchema, ratingSchema } = require('../src/validation');

const validSignup = {
  name: 'A Name That Is Long Enough',
  email: 'person@example.com',
  address: 'Somewhere',
  password: 'StrongPass!'
};

test('signup validation enforces name length, password policy and email format', () => {
  assert.equal(parseOrThrow(signupSchema, validSignup).email, validSignup.email);
  assert.throws(() => parseOrThrow(signupSchema, { ...validSignup, name: 'Too short' }), /20/);
  assert.throws(() => parseOrThrow(signupSchema, { ...validSignup, password: 'lowercase!' }));
  assert.throws(() => parseOrThrow(signupSchema, { ...validSignup, email: 'not-an-email' }));
});

test('ratings accept only whole numbers between one and five', () => {
  assert.equal(parseOrThrow(ratingSchema, { value: '5' }).value, 5);
  for (const value of [0, 6, 2.5, 'bad']) {
    assert.throws(() => parseOrThrow(ratingSchema, { value }));
  }
});
