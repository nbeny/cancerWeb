import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { AuthPayload, LoginInput, RegisterInput } from './auth.types'
import { User } from '../users/user.type'
import { Public } from '../common/decorators/public.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from './cookies'
import type { GqlContext } from '../graphql/graphql.module'
import { Env } from '../config/env'

@Resolver()
export class AuthResolver {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get cookieConfig() {
    return { secure: this.config.get('COOKIE_SECURE') }
  }

  @Public()
  @Mutation(() => AuthPayload)
  async register(@Args('input') input: RegisterInput, @Context() ctx: GqlContext): Promise<AuthPayload> {
    const session = await this.auth.register(input.email, input.password, input.name, ctx.req.headers['user-agent'])
    setSessionCookies(ctx.res, session, this.cookieConfig)
    return { user: session.user }
  }

  @Public()
  @Mutation(() => AuthPayload)
  async login(@Args('input') input: LoginInput, @Context() ctx: GqlContext): Promise<AuthPayload> {
    const session = await this.auth.login(input.email, input.password, ctx.req.headers['user-agent'])
    setSessionCookies(ctx.res, session, this.cookieConfig)
    return { user: session.user }
  }

  @Public()
  @Mutation(() => AuthPayload)
  async refresh(@Context() ctx: GqlContext): Promise<AuthPayload> {
    const raw = ctx.req.cookies?.[REFRESH_COOKIE] as string | undefined
    const session = await this.auth.refresh(raw, ctx.req.headers['user-agent'])
    setSessionCookies(ctx.res, session, this.cookieConfig)
    return { user: session.user }
  }

  @Public()
  @Mutation(() => Boolean)
  async logout(@Context() ctx: GqlContext): Promise<boolean> {
    await this.auth.logout(ctx.req.cookies?.[REFRESH_COOKIE] as string | undefined)
    clearSessionCookies(ctx.res, this.cookieConfig)
    return true
  }

  @Query(() => User)
  me(@CurrentUser() user: User): User {
    return user
  }
}
