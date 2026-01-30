/**
 * Strategy file validation tests
 * Ensures all built-in strategies conform to schema
 * Run with: node strategies.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const STRATEGIES_DIR = __dirname;

// Get all strategy files (exclude schema and test files)
const strategyFiles = fs.readdirSync(STRATEGIES_DIR)
  .filter(file => file.endsWith('.json') && file !== 'schema.json');

test('All strategy files are valid JSON', () => {
  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(filePath, 'utf8')),
      `${file} should be valid JSON`
    );
  });
});

test('All strategies have required top-level fields', () => {
  const requiredFields = ['$schema', 'name', 'version', 'type', 'description', 'validation'];

  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    requiredFields.forEach(field => {
      assert.ok(
        strategy.hasOwnProperty(field),
        `${file} should have '${field}' field`
      );
    });
  });
});

test('All strategies have valid type field', () => {
  const validTypes = ['first-line', 'full-message'];

  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    assert.ok(
      validTypes.includes(strategy.type),
      `${file} should have type 'first-line' or 'full-message', got '${strategy.type}'`
    );
  });
});

test('All strategies have valid version format', () => {
  const semverPattern = /^\d+\.\d+\.\d+$/;

  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    assert.ok(
      semverPattern.test(strategy.version),
      `${file} should have semantic version (X.Y.Z), got '${strategy.version}'`
    );
  });
});

test('First-line strategies have pattern and message', () => {
  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (strategy.type === 'first-line') {
      assert.ok(
        strategy.validation.pattern,
        `${file} (first-line) should have validation.pattern`
      );
      assert.strictEqual(
        typeof strategy.validation.pattern,
        'string',
        `${file} validation.pattern should be a string`
      );
      assert.ok(
        strategy.validation.message,
        `${file} (first-line) should have validation.message`
      );
    }
  });
});

test('Full-message strategies have mode and fields', () => {
  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (strategy.type === 'full-message') {
      assert.ok(
        strategy.validation.mode,
        `${file} (full-message) should have validation.mode`
      );
      assert.ok(
        ['all', 'any'].includes(strategy.validation.mode),
        `${file} validation.mode should be 'all' or 'any', got '${strategy.validation.mode}'`
      );
      assert.ok(
        Array.isArray(strategy.validation.fields),
        `${file} (full-message) should have validation.fields as array`
      );
      assert.ok(
        strategy.validation.fields.length > 0,
        `${file} validation.fields should not be empty`
      );
    }
  });
});

test('Full-message field definitions are complete', () => {
  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (strategy.type === 'full-message') {
      strategy.validation.fields.forEach((field, index) => {
        assert.ok(
          field.name,
          `${file} field[${index}] should have 'name'`
        );
        assert.ok(
          field.pattern,
          `${file} field[${index}] should have 'pattern'`
        );
        assert.ok(
          field.message,
          `${file} field[${index}] should have 'message'`
        );
      });
    }
  });
});

test('All regex patterns compile successfully', () => {
  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (strategy.type === 'first-line') {
      assert.doesNotThrow(
        () => new RegExp(strategy.validation.pattern),
        `${file} validation.pattern should be valid regex: ${strategy.validation.pattern}`
      );
    } else if (strategy.type === 'full-message') {
      strategy.validation.fields.forEach((field, index) => {
        assert.doesNotThrow(
          () => new RegExp(field.pattern),
          `${file} field[${index}].pattern should be valid regex: ${field.pattern}`
        );
      });
    }

    // Test skip pattern if present
    if (strategy.skip?.pattern) {
      assert.doesNotThrow(
        () => new RegExp(strategy.skip.pattern),
        `${file} skip.pattern should be valid regex: ${strategy.skip.pattern}`
      );
    }
  });
});

test('Strategy names follow naming convention', () => {
  const namePattern = /^[a-z0-9-]+$/;

  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    assert.ok(
      namePattern.test(strategy.name),
      `${file} name should contain only lowercase letters, numbers, and hyphens, got '${strategy.name}'`
    );
  });
});

test('Strategy filename matches strategy name', () => {
  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const expectedFilename = `${strategy.name}.json`;

    assert.strictEqual(
      file,
      expectedFilename,
      `Filename '${file}' should match strategy name '${strategy.name}' (expected: ${expectedFilename})`
    );
  });
});

test('All strategies reference the correct schema', () => {
  const expectedSchema = './schema.json';

  strategyFiles.forEach(file => {
    const filePath = path.join(STRATEGIES_DIR, file);
    const strategy = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    assert.strictEqual(
      strategy.$schema,
      expectedSchema,
      `${file} should reference schema as '${expectedSchema}'`
    );
  });
});

console.log(`\n✅ All strategy validation tests defined (${strategyFiles.length} strategies checked)\n`);
console.log('Strategies tested:', strategyFiles.join(', '));
console.log('\nRun with: node strategies.test.js\n');
