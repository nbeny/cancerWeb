import { Field, InputType, ObjectType } from '@nestjs/graphql'
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator'
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
} from '@cancerweb/validation'
import { User } from '../users/user.type'

@InputType()
export class RegisterInput {
  @Field() @IsEmail() email!: string
  @Field()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string
  @Field() @IsString() @MinLength(NAME_MIN_LENGTH) @MaxLength(NAME_MAX_LENGTH) name!: string
}

@InputType()
export class LoginInput {
  @Field() @IsEmail() email!: string
  @Field() @IsString() @MinLength(1) password!: string
}

@ObjectType()
export class AuthPayload {
  @Field(() => User) user!: User
}
