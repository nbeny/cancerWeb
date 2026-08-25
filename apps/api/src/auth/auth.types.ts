import { Field, InputType, ObjectType } from '@nestjs/graphql'
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator'
import { User } from '../users/user.type'

@InputType()
export class RegisterInput {
  @Field() @IsEmail() email!: string
  @Field() @IsString() @MinLength(12, { message: 'Le mot de passe doit faire au moins 12 caractères' }) @MaxLength(200) password!: string
  @Field() @IsString() @MinLength(2) @MaxLength(80) name!: string
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
