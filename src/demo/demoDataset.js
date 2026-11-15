/**
 * DADOS FICTÍCIOS — EXCLUSIVOS DA DEMONSTRAÇÃO PÚBLICA (/demo).
 *
 * Nada aqui pertence a uma pessoa real: os livros são clássicos em domínio
 * público e todas as sessões, horários, observações e avaliações foram
 * inventados para mostrar como o ReadTrack funciona.
 *
 * Como estes dados ficam isolados:
 * - Vivem só na área de armazenamento da demonstração ('readtrack:demo'),
 *   separada dos dados pessoais ('readtrack:data') e do Supabase.
 * - Todos os ids começam com DEMO_ID_PREFIX ('demo_') e o conjunto inteiro
 *   leva meta.workspace = 'demo'. A importação de backup para uma conta
 *   recusa esses registros (veja services/storage/dataTransfer.js).
 * - Nunca são gravados em contas: a demonstração não usa o Supabase.
 *
 * As datas são calculadas a partir de "agora" (com um padrão fixo de dias de
 * leitura), para que Dia, Semana, Mês, 3 meses e Histórico total sempre
 * tenham dados. Nenhuma sessão fica no futuro.
 */
import { createEmptyData } from '../services/storage/schema.js';
import { addDays } from '../utils/date.js';
import { withRecomputedNewPages } from '../utils/pages.js';
import { evaluateAchievements, findNewAchievements } from '../utils/achievements.js';
import { DEMO_ID_PREFIX, DEMO_WORKSPACE } from './demoIds.js';

export { DEMO_ID_PREFIX, DEMO_WORKSPACE, isDemoRecordId } from './demoIds.js';

/** Muda quando o conjunto fictício muda; a demonstração salva é recriada. */
export const DEMO_DATASET_VERSION = 2; // 2 (1.7.0): e-book, audiobook e caderno de anotações

export const DEMO_GOALS = Object.freeze({ dailyMinutes: 30, weeklyPages: 60 });

const id = (kind, slug) => `${DEMO_ID_PREFIX}${kind}_${slug}`;

/**
 * Livros e o intervalo de dias (atrás de hoje) em que cada um foi lido.
 * `pages`: páginas de conteúdo a cobrir no intervalo (o livro em andamento
 * para no meio). `startPage`: marcador antes da primeira sessão.
 */
const BOOKS = [
  {
    slug: 'dom-casmurro',
    title: 'Dom Casmurro',
    author: 'Machado de Assis',
    totalPages: 256,
    coverColor: '#6B3A3A',
    description:
      'Bento Santiago, já velho, narra a juventude e o casamento com Capitu, tentando provar uma traição que talvez só exista na memória dele.',
    from: 150,
    to: 121,
    pages: 256,
    secondsPerPage: 82,
    rating: 5,
    review: 'Releria. O narrador não é confiável e o livro inteiro depende disso: cada capítulo muda o que eu achava do anterior.',
    learnings: 'Prestar atenção em quem conta a história, e não só no que é contado.',
  },
  {
    slug: 'o-alienista',
    title: 'O Alienista',
    author: 'Machado de Assis',
    totalPages: 96,
    coverColor: '#36575C',
    description: 'O médico Simão Bacamarte funda um hospício em Itaguaí e passa a internar quase toda a cidade em nome da ciência.',
    from: 119,
    to: 110,
    pages: 96,
    secondsPerPage: 70,
    rating: 4,
    review: 'Curto e muito engraçado. A sátira à certeza científica continua atual.',
    learnings: '',
  },
  {
    slug: 'o-cortico',
    title: 'O Cortiço',
    author: 'Aluísio Azevedo',
    totalPages: 304,
    coverColor: '#3F5A4A',
    description:
      'A vida coletiva de um cortiço no Rio de Janeiro do século XIX, onde a ambição de João Romão e o ambiente moldam o destino dos moradores.',
    from: 107,
    to: 72,
    pages: 304,
    secondsPerPage: 74,
    rating: 4,
    review: 'As descrições do cortiço acordando são das melhores que já li. Algumas partes envelheceram mal.',
    learnings: 'Como o naturalismo trata o ambiente quase como um personagem.',
  },
  {
    slug: 'iracema',
    title: 'Iracema',
    author: 'José de Alencar',
    totalPages: 176,
    contentStartPage: 9, // capa, prefácio e carta ao leitor antes do texto
    coverColor: '#6A5130',
    description: 'A lenda da virgem dos lábios de mel e do guerreiro português Martim, contada em prosa poética.',
    from: 69,
    to: 50,
    pages: 168,
    startPage: 8,
    secondsPerPage: 88,
    rating: 3,
    review: 'Linguagem bonita, mas lenta para mim. Valeu pelo vocabulário.',
    learnings: 'Anotar palavras desconhecidas ajudou muito.',
  },
  {
    slug: 'bras-cubas',
    title: 'Memórias Póstumas de Brás Cubas',
    author: 'Machado de Assis',
    totalPages: 240,
    coverColor: '#2F4468',
    description: 'Um defunto autor conta a própria vida com ironia, revendo ambições, amores e fracassos da elite carioca.',
    from: 46,
    to: 0,
    pages: 150,
    secondsPerPage: 80,
    reading: true,
  },
];

const WANT_TO_READ = {
  slug: 'policarpo-quaresma',
  title: 'Triste Fim de Policarpo Quaresma',
  author: 'Lima Barreto',
  totalPages: 288,
  coverColor: '#4E4A6E',
  description: 'Major Quaresma, patriota ingênuo, tenta reformar o Brasil pela língua, pela agricultura e pela política.',
};

/** Lido antes de usar o ReadTrack: concluído, sem sessões nem tempo. */
const PAST_BOOK = {
  slug: 'a-moreninha',
  title: 'A Moreninha',
  author: 'Joaquim Manuel de Macedo',
  totalPages: 224,
  coverColor: '#5A4366',
  daysAgo: 210,
  rating: 4,
  review: 'Leitura leve das férias. Cadastrado como "já lido": não tem sessões nem tempo.',
};

/** Observações e vocabulário de algumas sessões (por livro, na ordem das sessões). */
const NOTES = {
  'dom-casmurro': {
    0: { notes: 'Começo leve; o narrador já desperta desconfiança.' },
    4: {
      notes: 'Capítulo dos “olhos de ressaca”.',
      vocabulary: [{ term: 'ressaca', meaning: 'Movimento das ondas que recuam depois de bater na praia.', anchor: { kind: 'page', value: 64 } }],
      annotations: [
        { type: 'quote', text: 'Olhos de cigana oblíqua e dissimulada.', note: 'A imagem que define Capitu no livro todo.', page: 63 },
        { type: 'idea', text: 'O narrador escolhe as palavras para convencer o leitor antes de apresentar os fatos.', page: 66 },
      ],
      mood: 'focused',
    },
    9: { notes: 'Anotado no caderno, sem cronômetro.', manual: true },
    10: { notes: 'Registro manual: esqueci de marcar o horário de término.', manual: true, unknownEnd: true },
    15: {
      notes: 'Final ambíguo, como prometido.',
      annotations: [{ type: 'question', text: 'O narrador é confiável? Ele mesmo admite que a memória falha.', page: 250, resolved: true }],
    },
  },
  'o-alienista': {
    1: { vocabulary: [{ term: 'alienista', meaning: 'Antigo nome do médico que tratava doenças mentais.' }] },
  },
  'o-cortico': {
    2: { notes: 'As descrições do cortiço acordando são ótimas.' },
    8: { notes: 'Sábado à tarde, leitura longa.', vocabulary: [{ term: 'estalagem', meaning: 'Hospedaria simples; aqui, o conjunto de casinhas de aluguel.' }] },
    20: { notes: 'Bertoleza merecia outro final.' },
  },
  iracema: {
    0: { notes: 'Comecei na página 9: as anteriores são prefácio.', vocabulary: [{ term: 'jandaia', meaning: 'Ave da família dos papagaios.' }] },
    3: { vocabulary: [{ term: 'oiticica', meaning: 'Árvore nativa do Nordeste.' }, { term: 'graúna', meaning: 'Pássaro de penas muito pretas.' }] },
  },
  'bras-cubas': {
    0: {
      notes: 'A dedicatória ao verme já diz muito.',
      annotations: [{ type: 'quote', text: 'Ao verme que primeiro roeu as frias carnes do meu cadáver dedico como saudosa lembrança estas memórias póstumas.', page: 5 }],
    },
    5: { notes: 'Capítulo curtíssimo, de propósito.', annotations: [{ type: 'idea', text: 'Os capítulos curtos imitam a conversa: o narrador interrompe a si mesmo o tempo todo.' }], mood: 'ok' },
    11: { notes: 'Leitura depois da meia-noite.', annotations: [{ type: 'question', text: 'Em que momento Quincas Borba volta à história?' }], mood: 'tired' },
  },
};

/** Gerador pseudoaleatório com semente fixa: o padrão é sempre o mesmo. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60_000;
const iso = (date) => date.toISOString();

function at(base, daysAgo, hour, minute) {
  const date = addDays(base, -daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** Dias de leitura: ~55% dos dias, com uma sequência de 12 e a atual de 5. */
function readingDays(random) {
  const days = new Set();
  for (let d = 150; d >= 1; d -= 1) if (random() < 0.55) days.add(d);
  for (let d = 98; d >= 87; d -= 1) days.add(d); // maior sequência: 12 dias
  days.delete(99);
  days.delete(86);
  for (let d = 5; d >= 1; d -= 1) days.add(d); // sequência atual (até ontem)
  days.delete(6);
  for (const d of [49, 48, 47, 70, 71, 108, 109, 120]) days.delete(d); // intervalos entre livros
  return days;
}

/** Divide `total` páginas entre sessões proporcionalmente aos pesos (soma exata, mínimo 1). */
function splitPages(total, weights) {
  const sum = weights.reduce((t, w) => t + w, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map((r) => Math.max(1, Math.floor(r)));
  let diff = total - out.reduce((t, n) => t + n, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((x, y) => y[0] - x[0]);
  for (let k = 0; diff !== 0 && k < order.length * 4; k += 1) {
    const i = order[k % order.length][1];
    if (diff > 0) {
      out[i] += 1;
      diff -= 1;
    } else if (out[i] > 1) {
      out[i] -= 1;
      diff += 1;
    }
  }
  return out;
}

/** Horário de início de uma sessão (dias úteis: manhã cedo ou noite; fim de semana: tarde). */
function startTime(base, daysAgo, random, second) {
  const day = addDays(base, -daysAgo).getDay();
  const weekend = day === 0 || day === 6;
  if (second) return at(base, daysAgo, weekend ? 19 : 12, Math.floor(random() * 40) + 5);
  if (weekend) return at(base, daysAgo, 10 + Math.floor(random() * 5), Math.floor(random() * 50));
  return random() < 0.35 ? at(base, daysAgo, 7, Math.floor(random() * 30) + 5) : at(base, daysAgo, 21, Math.floor(random() * 45));
}

/**
 * Conjunto completo da demonstração, no mesmo formato dos dados do app.
 * @param {Date} now momento de referência (as sessões terminam antes dele)
 */
export function createDemoWorkspaceData(now = new Date()) {
  const base = new Date(now);
  const random = mulberry32(20261019);
  const days = readingDays(random);
  const books = [];
  let sessions = [];

  for (const plan of BOOKS) {
    const bookId = id('book', plan.slug);
    // Sessões do livro: dias de leitura do intervalo; às vezes duas no mesmo dia.
    const slots = [];
    for (let d = plan.from; d >= Math.max(plan.to, 0); d -= 1) {
      if (d === 0) continue; // hoje é tratado à parte
      if (!days.has(d)) continue;
      slots.push({ daysAgo: d, second: false });
      if (random() < 0.15) slots.push({ daysAgo: d, second: true });
    }
    // Hoje: uma sessão curta que termina antes de agora (se ainda der tempo hoje).
    if (plan.reading) {
      const todayStart = new Date(now.getTime() - 50 * MIN);
      if (todayStart.getDate() === now.getDate() && todayStart.getHours() >= 6) slots.push({ daysAgo: 0, today: todayStart });
    }

    // Peso de cada sessão (minutos sorteados); a de hoje tem 14 páginas fixas (~18 min).
    const TODAY_PAGES = 14;
    const hasToday = slots.some((slot) => slot.today);
    const weights = slots.filter((slot) => !slot.today).map(() => 14 + random() * 36);
    const pagesBySlot = [...splitPages(plan.pages - (hasToday ? TODAY_PAGES : 0), weights), ...(hasToday ? [TODAY_PAGES] : [])];
    let page = plan.startPage ?? 0;
    let firstStart = null;
    let lastEnd = null;

    slots.forEach((slot, index) => {
      const extra = NOTES[plan.slug]?.[index] ?? {};
      let startedAt = slot.today ?? startTime(base, slot.daysAgo, random, slot.second);
      // Uma leitura do livro em andamento atravessa a meia-noite (23:40 → 00:2x).
      const crossesMidnight = plan.reading && index === 11 && slot.daysAgo > 1;
      if (crossesMidnight) startedAt = at(base, slot.daysAgo, 23, 40);
      const pages = pagesBySlot[index];
      // Duração coerente com o ritmo do livro (±15%), nunca menos de 3 minutos.
      const paced = Math.max(180, Math.round(pages * plan.secondsPerPage * (0.85 + random() * 0.3)));
      const durationSeconds = slot.today ? Math.min(paced, 25 * 60) : crossesMidnight ? Math.max(paced, 30 * 60) : paced;
      const paused = !extra.manual && index % 6 === 3 ? 4 * 60 : 0;
      const finishedAt = new Date(startedAt.getTime() + (durationSeconds + paused) * 1000);
      const manual = Boolean(extra.manual);
      const startPage = manual ? page + 1 : page;
      const endPage = page + pages;
      page = endPage;
      firstStart ??= startedAt;
      lastEnd = finishedAt;
      const segments = manual
        ? []
        : paused
          ? [
              { start: iso(startedAt), end: iso(new Date(startedAt.getTime() + (durationSeconds / 2) * 1000)) },
              { start: iso(new Date(startedAt.getTime() + (durationSeconds / 2 + paused) * 1000)), end: iso(finishedAt) },
            ]
          : [{ start: iso(startedAt), end: iso(finishedAt) }];
      sessions.push({
        id: id('session', `${plan.slug}_${index + 1}`),
        bookId,
        source: manual ? 'manual' : 'timer',
        startedAt: iso(startedAt),
        finishedAt: manual && extra.unknownEnd ? null : iso(finishedAt),
        durationSeconds: manual && extra.unknownEnd ? null : durationSeconds,
        pausedSeconds: paused,
        pauseCount: paused ? 1 : 0,
        segments,
        startPage,
        endPage,
        pagesRead: manual ? endPage - startPage + 1 : endPage - startPage,
        newPages: pages,
        notes: extra.notes ?? '',
        vocabulary: extra.vocabulary ?? [],
        annotations: demoAnnotations(plan.slug, index, extra.annotations, finishedAt),
        mood: extra.mood ?? null,
        progressKind: 'pages',
        createdAt: iso(finishedAt),
        updatedAt: iso(finishedAt),
        isDemo: false,
      });
    });

    const finished = !plan.reading;
    books.push({
      id: bookId,
      title: plan.title,
      author: plan.author,
      totalPages: plan.totalPages,
      currentPage: finished ? plan.totalPages : page,
      contentStartPage: plan.contentStartPage ?? null,
      status: finished ? 'finished' : 'reading',
      coverUrl: '',
      coverColor: plan.coverColor,
      description: plan.description,
      rating: plan.rating ?? null,
      review: plan.review ?? '',
      learnings: plan.learnings ?? '',
      addedAsRead: false,
      startedAt: iso(firstStart),
      finishedAt: finished ? iso(lastEnd) : null,
      createdAt: iso(firstStart),
      updatedAt: iso(lastEnd),
      isDemo: false,
    });
  }

  // 1.7.0: um e-book lido por porcentagem e um audiobook (outros formatos).
  const extra = createFormatBooks(base);
  books.push(...extra.books);
  sessions.push(...extra.sessions);

  const created = at(base, 152, 20, 0);
  books.push({
    id: id('book', WANT_TO_READ.slug),
    ...omitSlug(WANT_TO_READ),
    currentPage: 0,
    contentStartPage: null,
    status: 'want-to-read',
    coverUrl: '',
    rating: null,
    review: '',
    learnings: '',
    addedAsRead: false,
    startedAt: null,
    finishedAt: null,
    createdAt: iso(created),
    updatedAt: iso(created),
    isDemo: false,
  });
  const pastFinished = at(base, PAST_BOOK.daysAgo, 12, 0);
  books.push({
    id: id('book', PAST_BOOK.slug),
    title: PAST_BOOK.title,
    author: PAST_BOOK.author,
    totalPages: PAST_BOOK.totalPages,
    currentPage: PAST_BOOK.totalPages,
    contentStartPage: null,
    status: 'finished',
    coverUrl: '',
    coverColor: PAST_BOOK.coverColor,
    description: '',
    rating: PAST_BOOK.rating,
    review: PAST_BOOK.review,
    learnings: '',
    addedAsRead: true,
    startedAt: null,
    finishedAt: iso(pastFinished),
    createdAt: iso(created),
    updatedAt: iso(created),
    isDemo: false,
  });

  // Páginas novas pela mesma regra do app (união de intervalos por livro).
  for (const book of books) sessions = withRecomputedNewPages(sessions, book);
  sessions.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  const data = {
    ...createEmptyData(),
    books,
    sessions,
    goals: { ...DEMO_GOALS },
    settings: { ...createEmptyData().settings, userName: 'Visitante' },
  };
  // Conquistas já calculadas (mesmas regras da conta), com as datas reais.
  data.achievements = findNewAchievements(
    evaluateAchievements({ books, sessions, now, goals: data.goals, weekStartsOn: data.settings.weekStartsOn }),
    [],
  );
  data.meta = {
    ...data.meta,
    createdAt: iso(now),
    updatedAt: iso(now),
    workspace: DEMO_WORKSPACE,
    demoDatasetVersion: DEMO_DATASET_VERSION,
    demoLoadedAt: iso(now),
  };
  return data;
}

/** Anotações do caderno da demonstração (ids estáveis, âncora na página). */
function demoAnnotations(slug, index, items = [], when) {
  return items.map((item, i) => {
    const out = {
      id: id('note', `${slug}_${index + 1}_${i + 1}`),
      type: item.type,
      text: item.text,
      note: item.note ?? '',
      anchor: item.page ? { kind: 'page', value: item.page } : item.seconds ? { kind: 'time', value: item.seconds } : item.percent ? { kind: 'percent', value: item.percent } : null,
      createdAt: iso(when),
    };
    if (item.type === 'question') out.resolved = Boolean(item.resolved);
    return out;
  });
}

/**
 * E-book (por porcentagem, já concluído) e audiobook (em andamento).
 * Não têm páginas: contam no tempo, nas sessões, na sequência e nos livros
 * concluídos. Usam um sorteio próprio, para não mudar o resto da demonstração.
 */
function createFormatBooks(base) {
  const random = mulberry32(20261115);
  const books = [];
  const sessions = [];

  // E-book "Senhora": sessões no almoço, de 88 a 62 dias atrás, até 100%.
  const ebookId = id('book', 'senhora');
  const ebookDays = [];
  for (let d = 88; d >= 62; d -= 2) ebookDays.push(d);
  const steps = splitPages(100, ebookDays.map(() => 6 + random() * 6));
  let percent = 0;
  ebookDays.forEach((daysAgo, index) => {
    const startedAt = at(base, daysAgo, 13, 5 + Math.floor(random() * 20));
    const durationSeconds = Math.round((18 + random() * 20) * 60);
    const finishedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const start = percent;
    percent += steps[index];
    const annotations =
      index === 3
        ? demoAnnotations('senhora', index, [{ type: 'idea', text: 'Aurélia compra o próprio casamento: o dinheiro é o verdadeiro assunto do romance.', percent: start + 2 }], finishedAt)
        : [];
    sessions.push({
      id: id('session', `senhora_${index + 1}`),
      bookId: ebookId,
      source: 'timer',
      startedAt: iso(startedAt),
      finishedAt: iso(finishedAt),
      durationSeconds,
      pausedSeconds: 0,
      pauseCount: 0,
      segments: [{ start: iso(startedAt), end: iso(finishedAt) }],
      startPage: 0,
      endPage: 0,
      pagesRead: 0,
      newPages: 0,
      progressKind: 'percent',
      startPercent: start,
      endPercent: percent,
      notes: index === 0 ? 'Lendo no celular, pelo app de e-books.' : '',
      vocabulary: index === 5 ? [{ term: 'dote', meaning: 'Bens que a noiva levava para o casamento.', anchor: { kind: 'percent', value: start + 1 } }] : [],
      annotations,
      mood: null,
      createdAt: iso(finishedAt),
      updatedAt: iso(finishedAt),
      isDemo: false,
    });
  });
  const ebookFirst = sessions[0];
  const ebookLast = sessions.at(-1);
  books.push({
    id: ebookId,
    title: 'Senhora',
    author: 'José de Alencar',
    format: 'digital',
    progressMode: 'percent',
    progressPercent: 100,
    totalPages: null,
    currentPage: 0,
    contentStartPage: null,
    status: 'finished',
    coverUrl: '',
    coverColor: '#36575C',
    description: 'Aurélia, rica de repente, “compra” o casamento com o homem que a trocou por um dote maior.',
    rating: 4,
    review: 'Li inteiro no celular. A virada do capítulo da noite de núpcias é ótima.',
    learnings: '',
    addedAsRead: false,
    startedAt: ebookFirst.startedAt,
    finishedAt: ebookLast.finishedAt,
    createdAt: ebookFirst.startedAt,
    updatedAt: ebookLast.finishedAt,
    isDemo: false,
  });

  // Audiobook "O Guarani": no caminho para casa (dias úteis), nos últimos 40 dias.
  const audioId = id('book', 'o-guarani');
  const audioDuration = 14 * 3600 + 20 * 60;
  const speed = 1.25;
  let position = 0;
  let count = 0;
  const audioSessions = [];
  for (let daysAgo = 40; daysAgo >= 1; daysAgo -= 1) {
    const weekday = addDays(base, -daysAgo).getDay();
    if (weekday === 0 || weekday === 6 || random() < 0.35) continue;
    const startedAt = at(base, daysAgo, 18, 10 + Math.floor(random() * 15));
    const durationSeconds = Math.round((22 + random() * 18) * 60);
    const finishedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const start = position;
    position = Math.min(audioDuration - 3600, position + Math.round(durationSeconds * speed));
    count += 1;
    const notesFor = {
      2: { notes: 'Narração muito boa nas cenas de floresta.', annotations: [{ type: 'quote', text: 'De um dos cabeços da Serra dos Órgãos desliza um fio de água.', seconds: 95 }] },
      6: { annotations: [{ type: 'question', text: 'Peri é inspirado em algum personagem histórico?', seconds: start + 600 }], mood: 'distracted' },
    }[count];
    audioSessions.push({
      id: id('session', `o-guarani_${count}`),
      bookId: audioId,
      source: 'timer',
      startedAt: iso(startedAt),
      finishedAt: iso(finishedAt),
      durationSeconds,
      pausedSeconds: 0,
      pauseCount: 0,
      segments: [{ start: iso(startedAt), end: iso(finishedAt) }],
      startPage: 0,
      endPage: 0,
      pagesRead: 0,
      newPages: 0,
      progressKind: 'audio',
      startPositionSeconds: start,
      endPositionSeconds: position,
      speed,
      notes: notesFor?.notes ?? '',
      vocabulary: count === 4 ? [{ term: 'cabeço', meaning: 'Cume arredondado de um monte.', anchor: { kind: 'time', value: start + 300 } }] : [],
      annotations: demoAnnotations('o-guarani', count - 1, notesFor?.annotations, finishedAt),
      mood: notesFor?.mood ?? null,
      createdAt: iso(finishedAt),
      updatedAt: iso(finishedAt),
      isDemo: false,
    });
  }
  sessions.push(...audioSessions);
  books.push({
    id: audioId,
    title: 'O Guarani',
    author: 'José de Alencar',
    format: 'audio',
    narrator: 'Narração fictícia (demonstração)',
    audioDurationSeconds: audioDuration,
    audioPositionSeconds: position,
    audioSpeed: speed,
    totalPages: null,
    currentPage: 0,
    contentStartPage: null,
    status: 'reading',
    coverUrl: '',
    coverColor: '#6B4A3A',
    description: 'A amizade entre o indígena Peri e a família de D. Antônio de Mariz, no Rio de Janeiro do século XVII.',
    rating: null,
    review: '',
    learnings: '',
    addedAsRead: false,
    startedAt: audioSessions[0]?.startedAt ?? iso(at(base, 40, 18, 0)),
    finishedAt: null,
    createdAt: audioSessions[0]?.startedAt ?? iso(at(base, 40, 18, 0)),
    updatedAt: audioSessions.at(-1)?.finishedAt ?? iso(at(base, 40, 18, 0)),
    isDemo: false,
  });
  return { books, sessions };
}

function omitSlug({ slug: _slug, ...rest }) {
  return rest;
}

