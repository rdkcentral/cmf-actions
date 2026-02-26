# CMF Actions

A collection of reusable GitHub Actions workflows and action templates for RDK Central projects. This repository provides standardized CI/CD workflows that can be used across RDK Central repositories to ensure consistent testing, compliance, and quality assurance.

## 📋 Table of Contents

- [Overview](#overview)
- [Available Actions](#available-actions)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## 🔍 Overview

CMF Actions provides a centralized location for GitHub Actions workflows that are commonly used across RDK Central projects. These actions help maintain consistent standards for:

- **Legal Compliance**: CLA (Contributor License Agreement) management
- **Code Quality**: Unit testing and validation
- **Commit Message Standards**: Automated commit message validation
- **Security Scanning**: FOSSology integration for license compliance

## 🚀 Available Actions

### 1. CLA (Contributor License Agreement)

**File**: `actions/cla.yml`

Manages contributor license agreements for pull requests. This workflow automatically checks if contributors have signed the CLA and prompts them to do so if needed.

**Features**:
- Automatic CLA signature verification
- Integration with remote signature storage
- Domain allowlist support
- Bot and dependency exclusions

**Triggers**:
- Pull request events (opened, closed, synchronize)
- Issue comments for re-checking

### 2. Unit Tests (L1 Tests)

**File**: `actions/L1-tests.yml`

Executes unit tests using the gtest framework in a containerized environment and uploads results to the RDK test management system.

**Features**:
- Runs in RDK CI container environment
- Executes gtest-based unit tests
- Automatic test result upload
- Integration with RDK orchestration services

**Triggers**:
- Pull requests to `develop` branch

### 3. FOSSology Integration (Stateless Diff Scan)

**File**: `actions/fossid_integration_stateless_diffscan_target_repo.yml`

Performs license scanning and compliance checks using FOSSology on pull request changes.

**Features**:
- Stateless differential scanning
- License compliance verification
- Integration with FOSSology system
- Fork protection (only runs on non-fork PRs)

**Triggers**:
- Pull request events (opened, synchronize, reopened)

### 4. Validate Commit Messages

**Path**: `actions/validate-commit-messages`

A flexible composite action for validating commit messages against configurable JSON-based strategies with detailed error feedback.

**Features**:
- Multiple validation strategies (Conventional Commits, RDK-B, Semantic Release, custom)
- JSON-based configuration with schema validation
- Detailed error feedback tailored to each strategy
- Handles edge cases (empty commits, force pushes, branch deletions)
- Event agnostic (push, pull_request, branch protection, manual triggers)

**Quick Start**:
```yaml
- uses: rdkcentral/cmf-actions/actions/validate-commit-messages@main
  with:
    base-ref: ${{ github.event.before }}
    head-ref: ${{ github.sha }}
    strategy: 'conventional'
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

📖 [Full Documentation](./actions/validate-commit-messages/README.md)

## 📖 Usage

### Using the CLA Action

To use the CLA action in your repository, create a workflow file (e.g., `.github/workflows/cla.yml`):

```yaml
name: "CLA Check"

permissions:
  contents: read
  pull-requests: write
  actions: write
  statuses: write

on:
  issue_comment:
    types: [created]
  pull_request_target:
    types: [opened, closed, synchronize]

jobs:
  CLA-Check:
    name: "CLA Signature Check"
    uses: rdkcentral/cmf-actions/.github/workflows/cla.yml@v1
    secrets:
      PERSONAL_ACCESS_TOKEN: ${{ secrets.CLA_ASSISTANT }}
```

### Using the Unit Tests Action

Copy the `actions/L1-tests.yml` to your repository's `.github/workflows/` directory and customize as needed:

```yaml
name: Unit Tests

on:
  pull_request:
    branches: [ develop ]

env:
  AUTOMATICS_UNAME: ${{ secrets.AUTOMATICS_UNAME }}
  AUTOMATICS_PASSCODE: ${{ secrets.AUTOMATICS_PASSCODE }}

jobs:
  unit-tests:
    name: Execute Unit Tests
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/rdkcentral/docker-rdk-ci:latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Run unit tests
        run: sh -c source/test/run_ut.sh

      - name: Upload test results
        if: github.repository_owner == 'rdkcentral'
        run: |
          git config --global --add safe.directory `pwd`
          gtest-json-result-push.py /tmp/Gtest_Report https://rdkeorchestrationservice.apps.cloud.comcast.net/rdke_orchestration_api/push_unit_test_results `pwd`
```

### Using the FOSSology Integration

Copy the `actions/fossid_integration_stateless_diffscan_target_repo.yml` to your repository:

```yaml
name: FOSSology License Scan

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: read

jobs:
  fossology-scan:
    if: ${{ ! github.event.pull_request.head.repo.fork }}
    uses: rdkcentral/build_tools_workflows/.github/workflows/fossid_integration_stateless_diffscan.yml@1.0.0
    secrets:
      FOSSID_CONTAINER_USERNAME: ${{ secrets.FOSSID_CONTAINER_USERNAME }}
      FOSSID_CONTAINER_PASSWORD: ${{ secrets.FOSSID_CONTAINER_PASSWORD }}
      FOSSID_HOST_USERNAME: ${{ secrets.FOSSID_HOST_USERNAME }}
      FOSSID_HOST_TOKEN: ${{ secrets.FOSSID_HOST_TOKEN }}
```

## 🔧 Required Secrets

Different actions require different secrets to be configured in your repository:

### For CLA Action:
- `CLA_ASSISTANT`: Personal access token with repo scope for CLA signature management

### For Unit Tests:
- `AUTOMATICS_UNAME`: Username for the automatic test management system
- `AUTOMATICS_PASSCODE`: Passcode for the automatic test management system

### For FOSSology Integration:
- `FOSSID_CONTAINER_USERNAME`: FOSSology container registry username
- `FOSSID_CONTAINER_PASSWORD`: FOSSology container registry password
- `FOSSID_HOST_USERNAME`: FOSSology host username
- `FOSSID_HOST_TOKEN`: FOSSology host authentication token

## 🏗️ Repository Structure

```
cmf-actions/
├── README.md                              # This file
├── actions/                               # Action templates
│   ├── cla.yml                           # CLA management workflow
│   ├── L1-tests.yml                      # Unit testing workflow
│   └── fossid_integration_stateless_diffscan_target_repo.yml
├── .github/
│   └── workflows/
│       └── cla.yml                       # Reusable CLA workflow
├── docs/                                 # Documentation (future)
└── examples/                             # Usage examples (future)
```

## 🤝 Contributing

We welcome contributions to improve and expand the CMF Actions collection! Here's how you can contribute:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/new-action`
3. **Add your action**: Place new workflow files in the `actions/` directory
4. **Update documentation**: Update this README with details about your new action
5. **Test thoroughly**: Ensure your action works correctly in different scenarios
6. **Submit a pull request**: Provide a clear description of your changes

### Guidelines for New Actions

- Follow the existing naming conventions
- Include comprehensive documentation
- Add usage examples
- Ensure security best practices
- Test with different repository configurations

## 📝 License

This project is part of RDK Central and follows the RDK licensing terms. Please refer to the main RDK Central documentation for specific license information.

## 📞 Support

For questions, issues, or contributions related to CMF Actions:

- **Issues**: Open an issue in this repository
- **Discussions**: Use GitHub Discussions for general questions
- **RDK Central**: Visit [RDK Central](https://rdkcentral.com) for broader RDK ecosystem support

---

**Maintained by**: RDK Central Team
**Last Updated**: September 2025