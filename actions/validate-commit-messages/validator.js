/**
 * Commit Message Validator
 *
 * Validates commit messages against configurable strategies (JSON-based).
 * Supports first-line and full-message validation modes:
 *   - first-line: validate only the commit subject (first line)
 *   - full-message: validate structured fields across the entire commit message
 *
 * @module validator
 */

const fs = require('fs');
const path = require('path');

/**
 * Strategy cache for memoization (prevents re-parsing files)
 *
 * Note: This cache is per-process and persists across multiple action invocations
 * within the same GitHub Actions job step. In typical usage (each action runs in a
 * fresh process), this provides no benefit. In edge cases where the action is called
 * multiple times via github-script in the same job, the cache could become stale if
 * strategy files are modified between calls. This is an unlikely scenario in practice.
 */
const strategyCache = new Map();

/**
 * Load and parse a strategy configuration from JSON file
 *
 * @param {string} strategyName - Name of the strategy (without extension)
 * @param {string} actionRootPath - Absolute path to the action root directory
 * @returns {{validator: object, loadTime: number}} Parsed validator and load time in ms (loadTime is for performance debugging)
 * @throws {Error} If strategy file not found or invalid
 */
function loadStrategy(strategyName, actionRootPath) {
  // Validate strategy name to prevent path traversal attacks
  if (!/^[a-z0-9-]+$/.test(strategyName)) {
    throw new Error(
      `❌ Invalid strategy name: '${strategyName}'\n` +
      `Strategy names must contain only lowercase letters, numbers, and hyphens.`
    );
  }

  // Check cache first
  if (strategyCache.has(strategyName)) {
    console.log(`⚡ Using cached strategy: ${strategyName}`);
    return { validator: strategyCache.get(strategyName), loadTime: 0 };
  }

  const loadStart = Date.now();
  const strategiesDir = path.join(actionRootPath, 'strategies');
  const strategyPath = path.join(strategiesDir, `${strategyName}.json`);

  // Check if strategy file exists
  if (!fs.existsSync(strategyPath)) {
    // List available strategies for helpful error message
    const available = fs.readdirSync(strategiesDir)
      .filter(f => f.endsWith('.json') && f !== 'schema.json')
      .map(f => f.replace(/\.json$/, ''));

    throw new Error(
      `❌ Strategy '${strategyName}' not found.\n` +
      `Available strategies: ${available.join(', ')}\n` +
      `To add a custom strategy, create: strategies/${strategyName}.json`
    );
  }

  // Parse JSON file
  let config;
  try {
    const fileContent = fs.readFileSync(strategyPath, 'utf8');
    config = JSON.parse(fileContent);
  } catch (parseError) {
    throw new Error(
      `❌ Failed to parse strategy file '${strategyName}.json':\n` +
      `${parseError.message}\n` +
      `Check file syntax and format.`
    );
  }

  const loadEnd = Date.now();
  const loadTime = loadEnd - loadStart;

  console.log(`📦 Loaded strategy: ${config.name} v${config.version} in ${loadTime}ms`);

  const validator = buildValidatorFromConfig(config);

  // Cache the validator
  strategyCache.set(strategyName, validator);

  return { validator, loadTime };
}

/**
 * Build a validator object from parsed configuration
 *
 * @param {object} config - Parsed strategy configuration
 * @returns {object} Validator with validate() function and metadata
 * @throws {Error} If config is missing required fields or has invalid structure
 */
function buildValidatorFromConfig(config) {
  // Validate required config fields
  if (!config.name || !config.version || !config.type || !config.validation) {
    throw new Error(
      `❌ Invalid strategy config: Missing required fields (name, version, type, validation)\n` +
      `Check that your strategy follows the schema.json format.`
    );
  }

  // Validate type is one of allowed values
  if (config.type !== 'first-line' && config.type !== 'full-message') {
    throw new Error(
      `❌ Invalid strategy config: type must be 'first-line' or 'full-message'\n` +
      `Found: '${config.type}'`
    );
  }

  // Validate name follows pattern (lowercase, numbers, hyphens only)
  if (!/^[a-z0-9-]+$/.test(config.name)) {
    throw new Error(
      `❌ Invalid strategy config: name must contain only lowercase letters, numbers, and hyphens\n` +
      `Found: '${config.name}'`
    );
  }

  // Validate version follows semantic versioning pattern
  if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
    throw new Error(
      `❌ Invalid strategy config: version must follow semantic versioning (X.Y.Z)\n` +
      `Found: '${config.version}'`
    );
  }

  // Validate validation structure based on type
  if (config.type === 'first-line') {
    if (!config.validation.pattern || typeof config.validation.pattern !== 'string') {
      throw new Error(
        `❌ Invalid strategy config: first-line type requires validation.pattern (string)\n` +
        `Check that your strategy follows the schema.json format.`
      );
    }
  } else if (config.type === 'full-message') {
    if (!config.validation.mode || !config.validation.fields) {
      throw new Error(
        `❌ Invalid strategy config: full-message type requires validation.mode and validation.fields\n` +
        `Check that your strategy follows the schema.json format.`
      );
    }
    if (config.validation.mode !== 'all' && config.validation.mode !== 'any') {
      throw new Error(
        `❌ Invalid strategy config: validation.mode must be 'all' or 'any'\n` +
        `Found: '${config.validation.mode}'`
      );
    }
    if (!Array.isArray(config.validation.fields) || config.validation.fields.length === 0) {
      throw new Error(
        `❌ Invalid strategy config: validation.fields must be a non-empty array\n` +
        `Check that your strategy follows the schema.json format.`
      );
    }
    // Validate each field has required properties
    config.validation.fields.forEach((field, index) => {
      if (!field.name || !field.pattern || !field.message) {
        throw new Error(
          `❌ Invalid strategy config: field at index ${index} is missing required properties (name, pattern, message)\n` +
          `Check that your strategy follows the schema.json format.`
        );
      }
    });
  }

  // Extract skip configuration with defaults
  const skipConfig = {
    enabled: config.skip?.enabled !== false, // Default true
    pattern: config.skip?.pattern || '^Merge ',
    message: config.skip?.message || '⏭️  Skipping merge commit: '
  };

  if (config.type === 'first-line') {
    return buildFirstLineValidator(config, skipConfig);
  }

  if (config.type === 'full-message') {
    return buildFullMessageValidator(config, skipConfig);
  }

  throw new Error(`❌ Unknown strategy type: ${config.type}`);
}

/**
 * Build validator for first-line strategies (validates commit subject only)
 */
function buildFirstLineValidator(config, skipConfig) {
  let regex;
  try {
    regex = new RegExp(
      config.validation.pattern,
      config.validation.flags || ''
    );
  } catch (regexError) {
    throw new Error(
      `❌ Invalid regex pattern in strategy '${config.name}':\n` +
      `Pattern: ${config.validation.pattern}\n` +
      `Error: ${regexError.message}`
    );
  }

  return {
    name: config.name,
    version: config.version,
    type: config.type,
    pattern: regex,
    validate: (msg) => regex.test(msg),
    expectedFormat: config.errorFormat || config.validation.message,
    examples: config.metadata?.examples,
    skip: skipConfig
  };
}

/**
 * Build validator for full-message strategies (validates entire commit message structure)
 */
function buildFullMessageValidator(config, skipConfig) {
  const patterns = {};
  const mode = config.validation.mode || 'all';

  // Compile all field patterns with error handling
  config.validation.fields.forEach(field => {
    try {
      patterns[field.name] = {
        regex: new RegExp(field.pattern, field.flags || ''),
        message: field.message
      };
    } catch (regexError) {
      throw new Error(
        `❌ Invalid regex pattern in strategy '${config.name}', field '${field.name}':\n` +
        `Pattern: ${field.pattern}\n` +
        `Error: ${regexError.message}`
      );
    }
  });

  return {
    name: config.name,
    version: config.version,
    type: config.type,
    mode: mode,
    patterns: patterns,
    validate: (msg) => {
      const errors = [];
      const matches = [];

      for (const { regex, message } of Object.values(patterns)) {
        if (regex.test(msg)) {
          matches.push(message);
        } else {
          errors.push(message);
        }
      }

      // Apply mode logic: 'all' (AND) or 'any' (OR)
      if (mode === 'any') {
        // At least one field must match (OR logic)
        return { valid: matches.length > 0, errors };
      } else {
        // All fields must match (AND logic) - default behavior
        return { valid: errors.length === 0, errors };
      }
    },
    expectedFormat: config.errorFormat,
    examples: config.metadata?.examples,
    skip: skipConfig
  };
}

/**
 * Fetch commits from GitHub API with error handling and retry logic
 *
 * @param {object} github - Octokit instance
 * @param {object} context - GitHub Actions context
 * @param {string} baseRef - Base commit SHA
 * @param {string} headRef - Head commit SHA
 * @returns {Array} Array of commit objects
 * @throws {Error} On API failures after retries
 */
async function fetchCommits(github, context, baseRef, headRef) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
        owner: context.repo.owner,
        repo: context.repo.repo,
        basehead: `${baseRef}...${headRef}`
      });

      return comparison.commits;
    } catch (error) {
      lastError = error;

      // Check if it's a rate limit error
      const remainingRateLimit = parseInt(error.response?.headers?.['x-ratelimit-remaining'], 10);
      if (error.status === 403 && remainingRateLimit === 0) {
        const resetTime = error.response.headers['x-ratelimit-reset'];
        const resetDate = new Date(resetTime * 1000);
        throw new Error(
          `❌ GitHub API rate limit exceeded.\n` +
          `Rate limit resets at: ${resetDate.toISOString()}\n` +
          `Please try again later or use a different token.`
        );
      }

      // Retry on network errors or 5xx errors
      if (attempt < maxRetries && (error.status >= 500 || error.code === 'ECONNRESET')) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.warn(`⚠️  API request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry on client errors (4xx except 403 rate limit)
      break;
    }
  }

  // All retries exhausted
  throw new Error(
    `❌ Failed to fetch commits from GitHub API after ${maxRetries} attempts:\n` +
    `${lastError.message}\n` +
    `Status: ${lastError.status || 'N/A'}`
  );
}

/**
 * Validate a batch of commits against a strategy
 *
 * @param {Array} commits - Array of commit objects from GitHub API
 * @param {object} validator - Validator with validate() function
 * @param {number} maxCommits - Warn if exceeding this number (0 = no limit)
 * @returns {object} Validation results with invalid commits and counters
 */
function validateCommits(commits, validator, maxCommits = 100) {
  // Warn on large commit ranges
  if (maxCommits > 0 && commits.length > maxCommits) {
    console.warn(
      `⚠️  Large commit range detected: ${commits.length} commits\n` +
      `⚠️  This may impact performance. Consider validating smaller ranges.`
    );
  }

  const invalidCommits = [];
  let skippedCount = 0;
  let validatedCount = 0;

  // Compile skip regex if enabled
  // Note: Invalid skip patterns will be logged as warnings and skipping will be disabled.
  // Strategy authors should validate their skip patterns before deployment.
  let skipRegex = null;
  if (validator.skip?.enabled) {
    try {
      skipRegex = new RegExp(validator.skip.pattern);
      console.log(`⏭️  Skip pattern enabled: ${validator.skip.pattern}`);
    } catch (regexError) {
      console.warn(`⚠️  Invalid skip pattern '${validator.skip.pattern}': ${regexError.message}`);
      console.warn(`⚠️  Skipping will be disabled for this run`);
    }
  }

  // Validate each commit
  for (const commit of commits) {
    const fullMsg = commit.commit.message;
    const firstLine = fullMsg.split('\n')[0];
    const sha = commit.sha.substring(0, 7);

    // Skip commits matching pattern
    if (skipRegex && skipRegex.test(firstLine)) {
      console.log(`${validator.skip.message}${sha}`);
      skippedCount++;
      continue;
    }

    validatedCount++;

    // Validate based on strategy type
    let isValid = false;
    let validationErrors = [];

    if (validator.type === 'first-line') {
      isValid = validator.validate(firstLine);
    } else if (validator.type === 'full-message') {
      const result = validator.validate(fullMsg);
      isValid = result.valid;
      validationErrors = result.errors;
    }

    if (!isValid) {
      console.log(`❌ Invalid: ${sha}`);
      invalidCommits.push({
        sha: sha,
        message: firstLine,
        errors: validationErrors
      });
    } else {
      console.log(`✅ Valid: ${sha}`);
    }
  }

  return {
    invalidCommits,
    skippedCount,
    validatedCount
  };
}

/**
 * Format error message for invalid commits
 *
 * @param {Array} invalidCommits - Array of invalid commit objects
 * @param {object} validator - Validator with name property
 * @returns {string} Formatted error message with commit details
 */
function formatErrorMessage(invalidCommits, validator) {
  const errorDetails = invalidCommits.map(commit => {
    const errorInfo = commit.errors && commit.errors.length > 0
      ? `\n(Missing: ${commit.errors.join(', ')})`
      : '';
    return `- ${commit.sha}: "${commit.message}"${errorInfo}`;
  }).join('\n');

  return `❌ ${invalidCommits.length} commit(s) do not match ${validator.name} format:\n\n${errorDetails}\n\n`;
}

module.exports = {
  loadStrategy,
  fetchCommits,
  validateCommits,
  formatErrorMessage
};
