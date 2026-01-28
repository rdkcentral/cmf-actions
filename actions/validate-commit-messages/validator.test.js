/**
 * Unit tests for validator.js
 * Run with: node validator.test.js
 * Requires Node.js 18+ for native test runner
 */

const test = require('node:test');
const assert = require('node:assert');
const { loadStrategy, formatErrorMessage } = require('./validator.js');
const fs = require('fs');
const path = require('path');

// Test: loadStrategy - valid strategy
test('loadStrategy loads valid strategy successfully', () => {
  const result = loadStrategy('rdkb');
  assert.strictEqual(result.validator.name, 'rdkb');
  assert.strictEqual(result.validator.type, 'full-message');
  assert.ok(result.validator);
  assert.ok(typeof result.validator.validate === 'function');
});

// Test: loadStrategy - path traversal protection
test('loadStrategy rejects path traversal attempts', () => {
  assert.throws(
    () => loadStrategy('../../../etc/passwd'),
    /Invalid strategy name/
  );
  assert.throws(
    () => loadStrategy('../../secrets'),
    /Invalid strategy name/
  );
  assert.throws(
    () => loadStrategy('foo/bar'),
    /Invalid strategy name/
  );
});

// Test: loadStrategy - invalid characters
test('loadStrategy rejects uppercase and special characters', () => {
  assert.throws(
    () => loadStrategy('MyStrategy'),
    /Invalid strategy name/
  );
  assert.throws(
    () => loadStrategy('my_strategy'),
    /Invalid strategy name/
  );
  assert.throws(
    () => loadStrategy('my.strategy'),
    /Invalid strategy name/
  );
});

// Test: loadStrategy - non-existent strategy
test('loadStrategy throws on non-existent strategy', () => {
  assert.throws(
    () => loadStrategy('nonexistent'),
    /ENOENT/
  );
});

// Test: loadStrategy - malformed JSON
test('loadStrategy handles malformed JSON gracefully', async (t) => {
  const testStrategyPath = path.join(__dirname, 'strategies', 'test-malformed.json');

  await t.test('setup: create malformed JSON', () => {
    fs.writeFileSync(testStrategyPath, '{invalid json}');
  });

  await t.test('verify error handling', () => {
    assert.throws(
      () => loadStrategy('test-malformed'),
      /Invalid or malformed strategy file/
    );
  });

  await t.test('cleanup', () => {
    fs.unlinkSync(testStrategyPath);
  });
});

// Test: loadStrategy - missing required fields
test('loadStrategy validates required config fields', async (t) => {
  const testStrategyPath = path.join(__dirname, 'strategies', 'test-incomplete.json');

  await t.test('setup: create incomplete strategy', () => {
    fs.writeFileSync(testStrategyPath, JSON.stringify({
      name: 'test-incomplete',
      version: '1.0.0'
      // Missing 'type' and 'validation'
    }));
  });

  await t.test('verify validation error', () => {
    assert.throws(
      () => loadStrategy('test-incomplete'),
      /Missing required fields/
    );
  });

  await t.test('cleanup', () => {
    fs.unlinkSync(testStrategyPath);
  });
});

// Test: loadStrategy - invalid type value
test('loadStrategy validates type field', async (t) => {
  const testStrategyPath = path.join(__dirname, 'strategies', 'test-badtype.json');

  await t.test('setup: create strategy with invalid type', () => {
    fs.writeFileSync(testStrategyPath, JSON.stringify({
      name: 'test-badtype',
      version: '1.0.0',
      type: 'invalid-type',
      validation: { pattern: '.*' }
    }));
  });

  await t.test('verify type validation', () => {
    assert.throws(
      () => loadStrategy('test-badtype'),
      /type must be 'first-line' or 'full-message'/
    );
  });

  await t.test('cleanup', () => {
    fs.unlinkSync(testStrategyPath);
  });
});

// Test: loadStrategy - invalid mode value
test('loadStrategy validates mode field for full-message', async (t) => {
  const testStrategyPath = path.join(__dirname, 'strategies', 'test-badmode.json');

  await t.test('setup: create strategy with invalid mode', () => {
    fs.writeFileSync(testStrategyPath, JSON.stringify({
      name: 'test-badmode',
      version: '1.0.0',
      type: 'full-message',
      validation: {
        mode: 'invalid-mode',
        fields: [{ name: 'test', pattern: '.*', message: 'test' }]
      }
    }));
  });

  await t.test('verify mode validation', () => {
    assert.throws(
      () => loadStrategy('test-badmode'),
      /validation.mode must be 'all' or 'any'/
    );
  });

  await t.test('cleanup', () => {
    fs.unlinkSync(testStrategyPath);
  });
});

// Test: First-line validator - valid commit
test('first-line validator accepts valid commit', async (t) => {
  const testStrategyPath = path.join(__dirname, 'strategies', 'test-firstline.json');

  await t.test('setup: create first-line strategy', () => {
    fs.writeFileSync(testStrategyPath, JSON.stringify({
      name: 'test-firstline',
      version: '1.0.0',
      type: 'first-line',
      validation: {
        pattern: '^(feat|fix): .+',
        message: 'Must start with feat or fix'
      }
    }));
  });

  await t.test('verify validation logic', () => {
    const { validator } = loadStrategy('test-firstline');

    // First-line validators test the message string directly and return boolean
    const validResult = validator.validate('feat: add feature');
    assert.strictEqual(validResult, true, 'Valid commit should return true');

    const invalidResult = validator.validate('invalid commit');
    assert.strictEqual(invalidResult, false, 'Invalid commit should return false');
  });

  await t.test('cleanup', () => {
    fs.unlinkSync(testStrategyPath);
  });
});

// Test: Full-message validator - mode 'all'
test('full-message validator with mode=all requires all fields', async (t) => {
  const testStrategyPath = path.join(__dirname, 'strategies', 'test-fullmsg-all.json');

  await t.test('setup: create full-message strategy with mode=all', () => {
    fs.writeFileSync(testStrategyPath, JSON.stringify({
      name: 'test-fullmsg-all',
      version: '1.0.0',
      type: 'full-message',
      validation: {
        mode: 'all',
        fields: [
          { name: 'Ticket', pattern: '^[A-Z]+-\\d+$', message: 'Ticket required' },
          { name: 'Description', pattern: '.+', message: 'Description required' }
        ]
      }
    }));
  });

  await t.test('verify all fields required', () => {
    const { validator } = loadStrategy('test-fullmsg-all');

    // Full-message validators test the full message string and return {valid, errors}
    // All fields present - should pass
    const validMsg = 'Subject\n\nTicket: ABC-123\nDescription: Test';
    const validResult = validator.validate(validMsg);
    assert.strictEqual(validResult.valid, true);
    assert.strictEqual(validResult.errors.length, 0);

    // Missing one field - should fail
    const invalidMsg = 'Subject\n\nTicket: ABC-123';
    const invalidResult = validator.validate(invalidMsg);
    assert.strictEqual(invalidResult.valid, false);
    assert.ok(invalidResult.errors.includes('Description required'));
  });

  await t.test('cleanup', () => {
    fs.unlinkSync(testStrategyPath);
  });
});

// Test: Full-message validator - mode 'any'
test('full-message validator with mode=any requires at least one field', async (t) => {
  const testStrategyPath = path.join(__dirname, 'strategies', 'test-fullmsg-any.json');

  await t.test('setup: create full-message strategy with mode=any', () => {
    fs.writeFileSync(testStrategyPath, JSON.stringify({
      name: 'test-fullmsg-any',
      version: '1.0.0',
      type: 'full-message',
      validation: {
        mode: 'any',
        fields: [
          { name: 'Bug', pattern: '^BUG-\\d+$', message: 'Bug ID' },
          { name: 'Feature', pattern: '^FEAT-\\d+$', message: 'Feature ID' }
        ]
      }
    }));
  });

  await t.test('verify at least one field required', () => {
    const { validator } = loadStrategy('test-fullmsg-any');

    // First field present - should pass
    const msg1 = 'Subject\n\nBug: BUG-123';
    const result1 = validator.validate(msg1);
    assert.strictEqual(result1.valid, true);

    // Second field present - should pass
    const msg2 = 'Subject\n\nFeature: FEAT-456';
    const result2 = validator.validate(msg2);
    assert.strictEqual(result2.valid, true);

    // No fields present - should fail
    const invalidMsg = 'Subject\n\nOther: value';
    const invalidResult = validator.validate(invalidMsg);
    assert.strictEqual(invalidResult.valid, false);
  });

  await t.test('cleanup', () => {
    fs.unlinkSync(testStrategyPath);
  });
});

// Test: Invalid regex patterns
test('validator handles invalid regex patterns gracefully', async (t) => {
  const testStrategyPath = path.join(__dirname, 'strategies', 'test-badregex.json');

  await t.test('setup: create strategy with invalid regex', () => {
    fs.writeFileSync(testStrategyPath, JSON.stringify({
      name: 'test-badregex',
      version: '1.0.0',
      type: 'first-line',
      validation: {
        pattern: '[invalid(regex',
        message: 'Invalid regex'
      }
    }));
  });

  await t.test('verify regex error handling', () => {
    assert.throws(
      () => loadStrategy('test-badregex'),
      /Failed to compile regex pattern/
    );
  });

  await t.test('cleanup', () => {
    fs.unlinkSync(testStrategyPath);
  });
});

// Test: formatErrorMessage
test('formatErrorMessage produces expected output', () => {
  const failures = [
    { sha: 'abc123', message: 'Invalid format' },
    { sha: 'def456', message: 'Missing field' }
  ];

  const result = formatErrorMessage(failures, 'test-strategy');

  assert.ok(result.includes('❌'), 'Should include error symbol');
  assert.ok(result.includes('2 commit(s)'), 'Should include failure count');
  assert.ok(result.includes('test-strategy'), 'Should include strategy name');
  assert.ok(result.includes('abc123'), 'Should include first SHA');
  assert.ok(result.includes('def456'), 'Should include second SHA');
  assert.ok(result.includes('Invalid format'), 'Should include first error');
  assert.ok(result.includes('Missing field'), 'Should include second error');
});

console.log('\n✅ All tests defined. Run with: node validator.test.js\n');
