import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rota } from './_lib.js';

/* Base de treinamento da Maria (somente leitura): preços, regras, convênios e como ela vende.
   Fonte única: robo/base/*.json (os mesmos arquivos que o robô usa). */
const ler = (f) => JSON.parse(readFileSync(join(process.cwd(), 'robo', 'base', f), 'utf8'));
let cache = null;

export default rota({
  GET: async () => {
    if (!cache) {
      const k = ler('conhecimento.json'), c = ler('convenios.json'), p = ler('precos.json');
      cache = { versao: k.versao, itens: k.itens, convenios: c.convenios, regra_convenio: c.regra, precos: p };
    }
    return cache;
  }
});
