# Mail2Post Development Guide

This document explains how to contribute to the Mail2Post project.

## Project Overview

This project implements a system that receives emails via Amazon SES, processes email content with
AWS Lambda, and forwards them as HTTP POST requests to specified web services. Infrastructure is
managed using the Serverless framework.

## Development Documentation

You can check project details in the following documents:

- [Requirements Document](docs/requirements.md) - Project requirements and goals
- [Architecture Overview](docs/architecture.md) - System architecture explanation
- [Implementation Plan](docs/implementation-plan.md) - Development phases and timeline
- [Technical Specifications](docs/technical-specifications.md) - Technical details and design
- [Testing Strategy](docs/testing-strategy.md) - Unit and integration testing implementation policy

This guide specifically details test API management and deployment procedures for developers.

## Development Environment Setup

### Prerequisites

- For Node.js, Serverless Framework, and other version requirements, see
  [docs/common-config.md](docs/common-config.md)
- npm 10.x or higher
- AWS CLI
- Docker (when using Devcontainer)
- Visual Studio Code (when using Devcontainer)

### Environment Construction

#### Environment Construction Using Devcontainer (Recommended)

You can build a development environment with Devcontainer using Visual Studio Code and Docker:

1. Install the
   [Remote - Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
   extension in Visual Studio Code
2. Clone the repository:
   ```bash
   git clone https://github.com/your-organization/mail2post.git
   cd mail2post
   ```
3. Open the folder in Visual Studio Code
4. Open the command palette (F1 key) and select `Remote-Containers: Reopen in Container`
5. When the Devcontainer build is complete, an environment with all necessary dependencies installed
   will be ready

#### Manual Setup

If not using Devcontainer, manually set up with the following steps:

```bash
# Clone the repository
git clone https://github.com/your-organization/mail2post.git
cd mail2post

# Install dependencies
npm install

# Generate TypeScript type definition files
npm run build:types
```

### AWS Credentials Configuration

Configure AWS credentials:

```bash
aws configure
```

Environment-specific settings are managed in `config/{stage}.json` files:

```bash
# Check development environment configuration file
cat config/dev.json

# Check production environment configuration file
cat config/prod.json
```

## Development Workflow

### Local Development

```bash
# TypeScript compilation (watch mode, using esbuild)
npm run watch

# Or individual commands
npm run build        # Normal build
npm run build:dev    # Development build (with source maps)
npm run build:prod   # Production build (minified)
npm run build:watch  # Watch mode

# Generate type definition files only
npm run build:types

# Run unit tests
npm test

# Unit tests (watch mode)
npm run test:watch

# Run integration tests
npm run test:integration
```

## Test Environment

Mail2Post uses multiple testing approaches to ensure quality:

### Types of Tests

- **Unit Tests**: Test individual functions and classes using Vitest in Devcontainer environment
- **Integration Tests**: Test overall system behavior using actual services in AWS development environment

### Test Execution Commands

```bash
# Run all unit tests
npm test

# Run unit tests in watch mode (automatically runs on file changes)
npm run test:watch

# Run integration tests (requires AWS environment)
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

### Test API

Integration tests use a dedicated test webhook API to receive and verify requests from Mail2Post.

#### Test API Configuration

- **API Gateway**: Provides webhook endpoints
- **Lambda Function**: Receives requests and returns responses
- **Configuration File**: `config/test-api.json` (auto-generated)

#### Test API Management Commands

```bash
# Deploy and setup test API
npm run test:setup:api

# Check test API status
npm run test:status

# Check test API logs
npm run test:logs

# Cleanup test API
npm run test:cleanup:api
```

#### Test API Usage Flow

1. **Setup**: Deploy test API with `npm run test:setup:api`
   - API Gateway + Lambda are automatically created
   - Configuration file `config/test-api.json` is auto-generated
   - Endpoint URL and resource information are displayed

2. **Test Execution**: Test API is used in integration tests
   - HTTP requests are sent from Mail2Post to test API
   - Lambda function returns request content in response
   - HTTP requests from Mail2Post include X-Mail-Processing-ID header for unique request tracking
   - Saved data can be retrieved with `GET /webhook` (specified by the following methods):
     - Header: `X-Mail-Processing-ID: <processing ID>`
     - Query parameter: `?mailProcessingId=<processing ID>`

3. **Status Check**: Check current status with `npm run test:status`
   - API Gateway and Lambda status
   - Recent request logs
   - Endpoint connection test

4. **Cleanup**: Delete resources with `npm run test:cleanup:api`
   - CloudFormation stack deletion
   - Configuration file deletion

#### Configuration File (Auto-generated)

Example of `config/test-api.json`:

```json
{
  "webhook": {
    "url": "https://example-api-gateway.execute-api.us-west-2.amazonaws.com/test/webhook",
    "apiId": "example123",
    "headers": {
      "Content-Type": "application/json"
    }
  },
  "aws": {
    "region": "us-west-2"
  },
  "test": {
    "timeout": 30000,
    "retryCount": 3,
    "cleanupAfterTest": true
  }
}
```

### Code Style Check and Fix

```bash
# Code style check and fix
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier formatting (src directory)
npm run format:all   # Prettier formatting (all files)
npm run format:check # Prettier check only
npm run lint:all     # Both ESLint and Prettier check
npm run fix:all      # Both ESLint and Prettier fix
```

### Deployment

```bash
# Deploy to development environment
npm run deploy:dev

# Deploy to staging environment
npm run deploy:staging

# Deploy to production environment
npm run deploy:prod
```

## Project Structure

```
mail2post/
├── .devcontainer/         # Devcontainer settings
│   ├── devcontainer.json  # VS Code Devcontainer configuration
│   ├── Dockerfile         # Development environment Docker container definition
│   └── docker-compose.yml # Docker Compose configuration
├── src/                   # Source code
│   ├── index.ts           # Main entry point
│   ├── handlers/          # Lambda function handlers
│   │   └── processEmail.ts
│   ├── services/          # Business logic
│   │   ├── EmailProcessingService.ts
│   │   ├── config.ts
│   │   └── s3EmailService.ts
│   ├── domain/            # Domain models and repositories
│   │   ├── models/        # Domain models
│   │   │   ├── Attachment.ts
│   │   │   ├── Email.ts
│   │   │   ├── HttpRequest.ts
│   │   │   ├── Route.ts
│   │   │   └── SlackMessage.ts
│   │   └── repositories/  # Repository pattern implementation
│   │       ├── EmailRepository.ts
│   │       ├── FileRouteRepository.ts
│   │       ├── InMemoryEmailRepository.ts
│   │       ├── Repository.ts
│   │       ├── RouteRepository.ts
│   │       ├── RouteRepositoryFactory.ts
│   │       └── S3RouteRepository.ts
│   ├── test-api/          # Test webhook API
│   │   └── webhook-receiver.ts
│   └── types/             # TypeScript type definitions
│       └── index.ts
├── tests/                 # Test code
│   ├── unit/              # Unit tests
│   │   ├── domain/
│   │   │   ├── models/
│   │   │   │   ├── Attachment.test.ts
│   │   │   │   ├── Email.test.ts
│   │   │   │   ├── HttpRequest.test.ts
│   │   │   │   ├── Route.test.ts
│   │   │   │   └── SlackMessage.test.ts
│   │   │   └── repositories/
│   │   │       ├── FileRouteRepository.test.ts
│   │   │       └── InMemoryEmailRepository.test.ts
│   │   ├── handlers/
│   │   └── services/
│   │       └── EmailProcessingService.test.ts
│   └── integration/       # Integration tests
│       ├── attachment-handling.integration.test.ts
│       ├── error-handling.integration.test.ts
│       ├── html-processing.integration.test.ts
│       ├── multi-endpoint.integration.test.ts
│       ├── route-config.integration.test.ts
│       └── ses-mail-processing.integration.test.ts
├── scripts/               # Management scripts
│   ├── setup-test-api.cjs # Test API setup
│   ├── cleanup-test-api.cjs # Test API cleanup
│   ├── test-api-status.cjs # Test API status check
│   └── cleanup-resources.cjs # Resource cleanup
├── config/                # Configuration files
│   ├── dev.json           # Development environment settings
│   ├── prod.json          # Production environment settings
│   ├── prod.json.example  # Production environment settings template
│   ├── staging.json.example # Staging environment settings template
│   ├── sendgrid.json      # SendGrid settings
│   ├── sendgrid.json.example # SendGrid settings template
│   └── test-api.json      # Test API settings (auto-generated)
├── docs/                  # Documentation
│   ├── architecture.md    # Architecture overview
│   ├── common-config.md   # Common configuration
│   ├── implementation-plan.md # Implementation plan
│   ├── requirements.md    # Requirements definition
│   ├── ses-setup-guide.md # SES setup guide
│   ├── technical-specifications.md # Technical specifications
│   └── testing-strategy.md # Testing strategy
├── serverless.yml         # Main app Serverless configuration
├── serverless-test-api.yml # Test API Serverless configuration
├── serverless.config.cjs  # Serverless configuration (common)
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Vitest unit test configuration
├── vitest.integration.config.ts # Vitest integration test configuration
├── esbuild.config.js      # ESBuild build configuration
├── eslint.config.js       # ESLint configuration
├── package.json           # npm configuration
├── CONTRIBUTING.md        # Development guide (Japanese)
├── README.md              # Project overview (Japanese)
├── debug-integration.mjs  # Integration test debug script
└── debug-webhook.js       # Webhook debug script
```

## Coding Conventions

- Use TypeScript type definitions appropriately
- Follow ESLint and Prettier rules
  - Code formatting is automatically handled by Prettier
  - Code quality is checked by ESLint
  - Recommend running `npm run fix:all` before commits
- Add JSDoc comments to functions and classes
- Follow Test-Driven Development (TDD) principles
- Follow [Conventional Commits](https://www.conventionalcommits.org/) format for commit messages

## Pull Request Procedure

1. Create a new branch for new features or bug fixes
2. Make code changes and add appropriate tests
3. Confirm all tests pass
4. Create a pull request describing the changes
5. Receive code review and make necessary corrections

## Release Process

1. Test all features in `develop` branch
2. Merge to `staging` branch and test in staging environment
3. Merge to `main` branch for production release
4. Add release tag (following semantic versioning)

## Troubleshooting

Common problems and solutions:

### Development Environment Related

- **Deployment Error**: Confirm AWS credentials are configured correctly
- **TypeScript Error**: Run `npm run build:clean` and rebuild
- **SES Configuration Error**: Check SES reception rules in AWS console
- **Devcontainer Build Error**: Confirm Docker is running and check Docker status with `docker info`
  command
- **Devcontainer Dependency Error**: Re-run `npm install` inside container

### Test API Related

- **Test API Setup Error**:
  - Check AWS credentials and region configuration
  - Confirm required IAM permissions (CloudFormation, API Gateway, Lambda)
  - Run `npm run test:cleanup:api` to cleanup resources then retry

- **Test API Status Check Error**:
  - Confirm `npm run test:setup:api` completed successfully
  - Check if `config/test-api.json` file exists
  - Check stack "mail2post-test-api-test" status in AWS console

- **Integration Test Failure**:
  - Check if test API is working properly with `npm run test:status`
  - Check test API logs with `npm run test:logs`
  - Check Lambda function response content

- **Test API Deletion Error**:
  - Manually delete CloudFormation stack in AWS console
  - Manually delete test API in API Gateway

For more detailed information or support, please create an issue.
