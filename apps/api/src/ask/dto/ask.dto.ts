import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class AskDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(2000)
  question!: string;
}
