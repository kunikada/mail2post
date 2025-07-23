import { describe, expect, it } from 'vitest';
import { AuthType, Route } from '@domain/models/Route';

describe('Route - apikey認証テスト', () => {
  it('apikey認証タイプが正しく設定される', () => {
    const route = new Route({
      emailAddress: 'test@example.com',
      postEndpoint: 'https://api.example.com/webhook',
      authType: 'apikey' as AuthType,
      authToken: 'api-key-123',
    });

    expect(route.authType).toBe('apikey');
    expect(route.authToken).toBe('api-key-123');
  });
});
