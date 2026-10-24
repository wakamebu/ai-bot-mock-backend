import { Controller, Get } from '@nestjs/common';

/**
 * 【モック】認証・認可は未実装。
 * 管理画面のログインを作るときに、ここでログイン中の管理者を返す想定。
 * それまでは常に未ログイン扱いで、/admin/* も認証なしで呼べる。
 */
@Controller('auth')
export class AuthController {
  @Get('me')
  me() {
    return { user: null, mock: true };
  }
}
