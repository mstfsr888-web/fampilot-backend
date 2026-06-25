import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsString() familyName: string;
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() locale?: string;
}
export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
export class RefreshDto {
  @IsString() refreshToken: string;
}
