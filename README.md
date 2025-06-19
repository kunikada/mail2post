[![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/code-quality.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/code-quality.yml)
# Mail2Post Project

Mail2Post is an AWS serverless application that receives emails and sends POST requests to specified URLs.

## Key Features

- Email reception via Amazon SES
- Email processing with Lambda functions
- Configurable POST request formats
- Parallel sending to multiple endpoints
- Slack channel notification integration
- Error handling and retry mechanisms
- Monitoring and logging

## Technology Stack

- **AWS Services**: SES, Lambda, S3, CloudWatch
- **Development Language**: TypeScript
- **Runtime & Infrastructure Versions**: See [common-config.md](docs/common-config.md)

## Usage

### Prerequisites

- AWS account with SES reception settings configured
  - **Important**: SES reception setup includes domain verification, DNS settings, and reception rule configuration
  - For detailed procedures, see [SES Reception Setup Guide](docs/ses-setup-guide.md)
- Node.js/Serverless environment meeting version requirements listed in [common-config.md](docs/common-config.md)
- AWS CLI credentials configured

### Setup Procedure

1. Clone the repository
   ```bash
   git clone <URL of this repository>
   cd mail2post
   ```
2. Install dependencies
   ```bash
   npm install
   ```
3. Edit environment-specific configuration files
   ```bash
   # Edit development environment settings
   vi config/dev.json
   # Edit production environment settings
   vi config/prod.json
   ```
4. Deploy
   ```bash
   # Deploy to development environment
   npm run deploy:dev
   # Deploy to production environment
   npm run deploy:prod
   ```

### Configuration & Options

Configuration is managed by environment-specific JSON files (`config/dev.json`, `config/staging.json`, `config/prod.json`).

For detailed configuration file structure and dynamic loading, refer to the [Architecture Document](docs/architecture.md).

The following configurations are available:

#### Routing Configuration (Required)

Routing configuration defines combinations of received email addresses (complete email addresses) and POST destinations. At least one route must be configured. Receivable email addresses are managed in the `ses.recipients` section.

**Main Configuration File Sections:**

| Section | Description |
| ---- | ---- |
| `aws` | AWS region, S3 bucket name, etc. |
| `ses` | SES reception settings, list of receivable email addresses |
| `routes` | Routing configuration per email address |
| `defaults` | Default settings applied to all routes |
| `system` | System-wide settings (log level, Lambda memory size, etc.) |

Configuration example (`config/dev.json`):

```json
{
  "aws": {
    "region": "ap-northeast-1",
    "bucketName": "mail2post-dev"
  },
  "ses": {
    "recipients": [
      "info@mail2post.com",
      "support@mail2post.com",
      "notifications@mail2post.com"
    ]
  },
  "routes": [
    {
      "emailAddress": "info@mail2post.com",
      "postEndpoint": "https://api.example.com/endpoint1",
      "format": "json",
      "headers": { "Authorization": "Bearer token1" }
    },
    {
      "emailAddress": "support@mail2post.com", 
      "postEndpoint": "https://api.example.com/endpoint2",
      "format": "form"
    },
    {
      "emailAddress": "alerts@mail2post.com",
      "postEndpoint": "https://api.example.com/alerts",
      "format": "json",
      "transformationOptions": {
        "contentSelection": "subject"
      }
    },
    {
      "type": "slack",
      "emailAddress": "notifications@mail2post.com",
      "webhookUrl": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
      "channel": "#mail-notifications"
    }
  ],
  "defaults": {
    "format": "json",
    "retryCount": 3,
    "retryDelay": 1000,
    "transformationOptions": {
      "htmlMode": "text",
      "inlineImages": "ignore",
      "maxSize": 10485760,
      "attachmentStore": false,
      "contentSelection": "full"
    }
  },
  "system": {
    "logLevel": "info",
    "lambdaMemorySize": 128,
    "lambdaTimeout": 30
  }
}
```

#### Email Processing Settings (Optional)

These settings can be configured in `defaults.transformationOptions` in the configuration file.

| Setting Name | Description | Default Value |
| ----------------------- | ------------------------------------------------ | ------------------ |
| `htmlMode` | HTML email processing method (`text`/`html`/`both`) | `text` |
| `inlineImages` | Inline image processing (`ignore`/`base64`/`url`) | `ignore` |
| `maxSize` | Maximum email size for processing (bytes) | `10485760` (10MB) |
| `attachmentStore` | Attachment file storage (`true`/`false`) | `false` |
| `allowedSenders` | Array of allowed senders (empty array allows all) | `[]` |
| `contentSelection` | Content to POST (`full`/`subject`/`body`) | `full` |

**contentSelection Option Details:**
- `full`: All email information (subject, body, sender, recipient, headers, etc.)
- `subject`: Subject only
- `body`: Body only

#### Common POST Request Settings (Optional)

These settings can be specified in the configuration file's `defaults` and per-route settings.

| Setting Name | Description | Default Value |
| ------------------ | ----------------------------------------------- | ------------ |
| `format` | POST data format (`json`/`form`/`multipart`) | `json` |
| `headers` | Additional HTTP headers (object format) | `{}` |
| `auth.type` | Authentication method (`none`/`bearer`/`basic`/`apikey`) | `none` |
| `auth.token` | Authentication token (required when auth.type is not none) | `""` |
| `retryCount` | Maximum retry count on failure | `3` |
| `retryDelay` | Retry interval (milliseconds) | `1000` |

#### System Settings

These settings can be specified in the configuration file's `system` section.

| Setting Name | Description | Default Value |
| -------------------- | ------------------------------------------- | ---------------------- |
| `logLevel` | Log level (`debug`/`info`/`warn`/`error`) | `info` |
| `notificationEmail` | Error notification email address | `""` |
| `lambdaMemorySize` | Lambda function memory size (MB) | `128` |
| `lambdaTimeout` | Lambda function timeout (seconds) | `30` |
| `routesConfigSource` | Route configuration source (usually `file`) | `file` |

### Email Reception to POST Flow

1. **SES Reception Setup**: Configure domain verification, DNS settings, and reception rules according to the [SES Reception Setup Guide](docs/ses-setup-guide.md)
2. **Email Sending**: Send an email to the specified email address (configured in SES)
3. **SES Processing**: SES receives the email and triggers the Lambda function based on configured reception rules
4. **Lambda Execution**: Lambda function identifies the appropriate route from environment-specific configuration files based on the email's destination address
5. **POST Sending**: According to the identified route configuration, analyze email content and send HTTP POST requests, or execute Slack notifications
6. **Log Confirmation**: Processing results can be confirmed in CloudWatch Logs

## Testing

### Test Environment

Mail2Post can execute the following two types of tests:

- **Unit Tests**: Using Vitest in Devcontainer environment
- **Integration Tests**: Using actual services in AWS development environment

For detailed testing strategies and test API configuration, refer to the [Development Guide](CONTRIBUTING.md).

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration
```

### Important Notes

- Creating and deleting AWS resources incurs charges. Please also check [Amazon SES Pricing](https://aws.amazon.com/ses/pricing/) before use.
- For detailed development and operation procedures, refer to the [Development Guide](CONTRIBUTING.md).

## License

[MIT License](LICENSE)
