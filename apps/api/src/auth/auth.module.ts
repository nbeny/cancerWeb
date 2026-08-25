import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthService } from './auth.service'
import { AuthResolver } from './auth.resolver'
import { PasswordService } from './password.service'
import { TokenService } from './token.service'

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthService, AuthResolver, PasswordService, TokenService],
  exports: [TokenService, AuthService],
})
export class AuthModule {}
