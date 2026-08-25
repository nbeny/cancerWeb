import { Injectable } from '@nestjs/common'
import { Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2'

@Injectable()
export class PasswordService {
  private readonly options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456, // 19 Mio — recommandation OWASP
    timeCost: 2,
    parallelism: 1,
  }

  hash(plain: string): Promise<string> {
    return argonHash(plain, this.options)
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argonVerify(hash, plain)
    } catch {
      // Un hash malformé en base ne doit pas faire tomber la requête de login.
      return false
    }
  }
}
