import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailProcessingService } from '@services/EmailProcessingService';
import { AuthType, Route } from '@domain/models/Route';
import { Email } from '@domain/models/Email';
import { InMemoryEmailRepository } from '@domain/repositories/InMemoryEmailRepository';
import { FileRouteRepository } from '@domain/repositories/FileRouteRepository';

// fetchのモック
(globalThis as any).fetch = vi.fn();

describe('EmailProcessingService - apikey認証テスト', () => {
  const mockFetch = vi.mocked((globalThis as any).fetch);

  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)
    );
  });

  it('x-api-keyヘッダーが正しく設定される', async () => {
    const emailRepo = new InMemoryEmailRepository();
    const routeRepo = new FileRouteRepository();
    const service = new EmailProcessingService(emailRepo, routeRepo);

    const route = new Route({
      emailAddress: 'test@example.com',
      postEndpoint: 'https://api.example.com/webhook',
      authType: 'apikey' as AuthType,
      authToken: 'test-api-key-123',
    });

    const email = new Email({
      id: 'test-email',
      timestamp: new Date(),
      subject: 'Test Subject',
      from: 'sender@example.com',
      to: ['test@example.com'],
      recipient: 'test@example.com',
      textBody: 'Test body',
    });

    // privateメソッドにアクセスするために型キャスト
    await (service as any).sendToEndpoint(email, route);

    // fetchが呼ばれたことを確認
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // fetchの引数を確認
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    const headers = options?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-api-key-123');
  });
});
