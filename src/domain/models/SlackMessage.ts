/**
 * Slackメッセージドメインモデル
 */

export class SlackMessage {
  private readonly webhook: string;
  private readonly messageText: string;
  private readonly targetChannel?: string;
  private readonly displayName?: string;
  private readonly emoji?: string;
  private readonly avatarUrl?: string;
  private readonly messageBlocks?: unknown[];
  private readonly messageAttachments?: unknown[];

  constructor(props: {
    webhookUrl: string;
    text: string;
    channel?: string;
    username?: string;
    iconEmoji?: string;
    iconUrl?: string;
    blocks?: unknown[];
    attachments?: unknown[];
  }) {
    this.webhook = props.webhookUrl;
    this.messageText = props.text;
    this.targetChannel = props.channel;
    this.displayName = props.username;
    this.emoji = props.iconEmoji;
    this.avatarUrl = props.iconUrl;
    this.messageBlocks = props.blocks ? [...props.blocks] : undefined;
    this.messageAttachments = props.attachments ? [...props.attachments] : undefined;
  }

  // ゲッター
  get webhookUrl(): string {
    return this.webhook;
  }
  get text(): string {
    return this.messageText;
  }
  get channel(): string | undefined {
    return this.targetChannel;
  }
  get username(): string | undefined {
    return this.displayName;
  }
  get iconEmoji(): string | undefined {
    return this.emoji;
  }
  get iconUrl(): string | undefined {
    return this.avatarUrl;
  }
  get blocks(): readonly unknown[] | undefined {
    return this.messageBlocks;
  }
  get attachments(): readonly unknown[] | undefined {
    return this.messageAttachments;
  }

  // Slack APIに送信するペイロードを生成
  toPayload(): object {
    const payload: Record<string, unknown> = {
      text: this.messageText,
    };

    if (this.targetChannel) payload.channel = this.targetChannel;
    if (this.displayName) payload.username = this.displayName;
    if (this.emoji) payload.icon_emoji = this.emoji;
    if (this.avatarUrl) payload.icon_url = this.avatarUrl;
    if (this.messageBlocks) payload.blocks = this.messageBlocks;
    if (this.messageAttachments) payload.attachments = this.messageAttachments;

    return payload;
  }

  // メールから簡単なSlackメッセージを作成するファクトリメソッド
  static fromEmailSimple(
    email: {
      subject: string;
      from: string;
      textBody: string;
      recipient: string;
    },
    webhookUrl: string,
    options?: {
      channel?: string;
      username?: string;
      iconEmoji?: string;
    }
  ): SlackMessage {
    const text = [
      `*件名:* ${email.subject}`,
      `*送信者:* ${email.from}`,
      `*宛先:* ${email.recipient}`,
      '',
      '```',
      email.textBody.substring(0, 1000) + (email.textBody.length > 1000 ? '...' : ''),
      '```',
    ].join('\n');

    return new SlackMessage({
      webhookUrl,
      text,
      channel: options?.channel,
      username: options?.username || '📧 Mail2Post',
      iconEmoji: options?.iconEmoji || ':email:',
    });
  }
}
