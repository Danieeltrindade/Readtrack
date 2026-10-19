/**
 * Dados de demonstração das versões 1.0–1.5, gravados junto dos dados do
 * modo local com `isDemo: true`.
 *
 * Desde a 1.6.0 eles NÃO são mais carregados no app: a demonstração pública
 * tem seus próprios dados fictícios e armazenamento (src/demo/). Este módulo
 * fica só como referência nos testes que garantem que dados antigos com
 * `isDemo` continuam fora das estatísticas, da migração e da conta.
 *
 * As datas são calculadas a partir de "agora", para que o Dashboard sempre
 * mostre uma semana viva. As páginas são encadeadas: cada sessão começa
 * onde a anterior terminou, e a soma bate com o total do livro.
 */
import { addDays } from '../utils/date.js';

export const DEMO_BOOK_IDS = Object.freeze({
  domCasmurro: 'demo_book_dom-casmurro',
  cortico: 'demo_book_o-cortico',
  brasCubas: 'demo_book_bras-cubas',
});

/**
 * Plano de cada livro: [diasAtrás, hora de início, páginas, observação?]
 * O ritmo (segundos por página) varia por livro para gerar médias realistas.
 */
const PLANS = [
  {
    id: DEMO_BOOK_IDS.domCasmurro,
    title: 'Dom Casmurro',
    author: 'Machado de Assis',
    totalPages: 256,
    genre: 'Romance',
    description:
      'Bento Santiago, já velho, narra a própria juventude e o casamento com Capitu, tentando provar uma traição que talvez só exista na sua memória.',
    coverColor: '#6B3A3A',
    status: 'finished',
    rating: 5,
    secondsPerPage: 78,
    sessions: [
      [41, 21, 30, 'Começo leve; o narrador já desperta desconfiança.'],
      [40, 20, 28],
      [38, 22, 36],
      [37, 7, 22, 'Leitura curta antes do trabalho.'],
      [35, 21, 40],
      [34, 20, 30],
      [32, 22, 38, 'Capítulo dos olhos de ressaca.'],
      [31, 21, 32, 'Final ambíguo, como prometido.'],
    ],
  },
  {
    id: DEMO_BOOK_IDS.cortico,
    title: 'O Cortiço',
    author: 'Aluísio Azevedo',
    totalPages: 304,
    genre: 'Naturalismo',
    description:
      'A vida coletiva de um cortiço no Rio de Janeiro do século XIX, onde a ambição de João Romão e o ambiente moldam o destino dos moradores.',
    coverColor: '#3F5A4A',
    status: 'finished',
    rating: 4,
    secondsPerPage: 70,
    sessions: [
      [27, 20, 32],
      [26, 21, 40, 'As descrições do cortiço acordando são ótimas.'],
      [24, 7, 28],
      [23, 21, 36],
      [21, 15, 44, 'Sábado à tarde, leitura longa.'],
      [20, 21, 30],
      [18, 22, 38],
      [16, 20, 26],
      [14, 21, 30, 'Terminado.'],
    ],
  },
  {
    id: DEMO_BOOK_IDS.brasCubas,
    title: 'Memórias Póstumas de Brás Cubas',
    author: 'Machado de Assis',
    totalPages: 240,
    genre: 'Romance',
    description:
      'Um defunto autor conta a própria vida com ironia, sem pressa e sem pudor, revendo ambições, amores e fracassos da elite carioca.',
    coverColor: '#2F4468',
    status: 'reading',
    rating: null,
    secondsPerPage: 84,
    sessions: [
      [11, 21, 24, 'A dedicatória ao verme já diz muito.'],
      [10, 20, 18],
      [8, 22, 30],
      [7, 7, 22],
      [4, 21, 10, 'Dia cansado, só um capítulo.'],
      [3, 20, 16],
      [2, 21, 12],
      [1, 22, 10],
    ],
  },
];

// Pequena variação determinística (±12%) para o tempo não ficar idêntico.
function variation(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return 0.88 + (x - Math.floor(x)) * 0.24;
}

function atHour(baseDate, daysAgo, hour, minuteOffset) {
  const date = addDays(baseDate, -daysAgo);
  date.setHours(hour, minuteOffset, 0, 0);
  return date;
}

export function createDemoData(now = new Date()) {
  const books = [];
  const sessions = [];

  PLANS.forEach((plan, bookIndex) => {
    let page = 0;
    let lastEnd = null;
    let firstStart = null;

    plan.sessions.forEach(([daysAgo, hour, pages, notes], i) => {
      const startedAt = atHour(now, daysAgo, hour, (i * 7 + bookIndex * 11) % 45);
      const durationSeconds = Math.round(pages * plan.secondsPerPage * variation(bookIndex * 100 + i));
      const finishedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
      const startPage = page;
      const endPage = page + pages;
      page = endPage;
      firstStart ??= startedAt;
      lastEnd = finishedAt;

      sessions.push({
        id: `demo_session_${bookIndex + 1}_${i + 1}`,
        bookId: plan.id,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationSeconds,
        pausedSeconds: 0,
        pauseCount: 0,
        segments: [{ start: startedAt.toISOString(), end: finishedAt.toISOString() }],
        startPage,
        endPage,
        pagesRead: pages,
        newPages: pages,
        notes: notes ?? '',
        vocabulary: [],
        source: 'timer',
        createdAt: finishedAt.toISOString(),
        isDemo: true,
      });
    });

    const finished = plan.status === 'finished';
    books.push({
      id: plan.id,
      title: plan.title,
      author: plan.author,
      totalPages: plan.totalPages,
      currentPage: finished ? plan.totalPages : page,
      status: plan.status,
      genre: plan.genre,
      coverUrl: '',
      coverColor: plan.coverColor,
      description: plan.description,
      rating: plan.rating,
      notes: '',
      startedAt: firstStart.toISOString(),
      finishedAt: finished ? lastEnd.toISOString() : null,
      createdAt: firstStart.toISOString(),
      updatedAt: lastEnd.toISOString(),
      isDemo: true,
    });
  });

  return { books, sessions };
}
