import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, PenLine, Play, Plus } from 'lucide-react';
import { BookCover, Button, FormatIcon } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { getBookProgress } from '../../../utils/stats.js';
import {
  FORMAT_LABELS,
  PROGRESS_KINDS,
  describeRemaining,
  formatAudioPosition,
  formatSpeed,
  getProgressKind,
  hasMeasurableProgress,
  normalizeFormat,
} from '../../../utils/formats.js';
import { estimateRemainingSeconds, getBookNumbers } from '../../../utils/dashboard.js';
import { formatDecimal, formatDuration, formatNumber, formatRelativeDay } from '../../../utils/format.js';

const KICKER = { print: 'Livro físico', digital: 'E-book · PDF', audio: 'Audiobook' };

/**
 * "Lendo agora": o livro, PDF ou audiobook em andamento, com a animação do
 * formato (ondas do áudio, páginas virando, folhas do PDF) e o atalho para
 * continuar. Com mais de um em andamento, dá para trocar pelas abas.
 */
export function NowReading({ books, sessions, activeSession, onManual, hasBooks = true }) {
  const ROUTES = usePaths();
  const [selectedId, setSelectedId] = useState(null);
  const current = books.find((b) => b.id === selectedId) ?? books.find((b) => b.id === activeSession?.bookId) ?? books[0] ?? null;

  if (!current) {
    return (
      <section className="now now--empty" aria-labelledby="now-title">
        <h2 id="now-title" className="now__kicker">
          Lendo agora
        </h2>
        <p className="now__empty-title">{hasBooks ? 'Nenhum livro em andamento' : 'Sua estante está vazia'}</p>
        <p className="now__empty-text">
          {hasBooks
            ? 'Escolha um livro, PDF ou audiobook da biblioteca e comece uma sessão — ou cadastre um novo.'
            : 'Cadastre o livro, PDF ou audiobook que você está lendo para registrar sessões e acompanhar o progresso.'}
        </p>
        <div className="now__actions">
          <Button to={ROUTES.newBook} icon={Plus}>
            Adicionar livro
          </Button>
          <Button to={ROUTES.library} variant="secondary" icon={BookOpen}>
            Ver biblioteca
          </Button>
        </div>
      </section>
    );
  }

  const format = normalizeFormat(current.format);
  const timerHere = activeSession?.bookId === current.id;
  const timerElsewhere = Boolean(activeSession) && !timerHere;

  return (
    <section className={`now now--${format}`} aria-labelledby="now-title" style={{ '--fc': `var(--format-${format})`, '--fc-text': `var(--format-${format}-text)` }}>
      <div className="now__glow now__glow--a" aria-hidden="true" />
      <div className="now__glow now__glow--b" aria-hidden="true" />

      <div className="now__top">
        <h2 className="now__kicker" id="now-label">
          Lendo agora
        </h2>
        <Link to={ROUTES.library} className="now__link">
          Biblioteca
        </Link>
      </div>

      {books.length > 1 && (
        <div className="now__picks" role="tablist" aria-label="Escolher o que está lendo">
          {books.slice(0, 6).map((book) => {
            const f = normalizeFormat(book.format);
            const on = book.id === current.id;
            return (
              <button
                key={book.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={`now__pick now__pick--${f}`}
                style={{ '--pc': `var(--format-${f})`, '--pc-text': `var(--format-${f}-text)` }}
                onClick={() => setSelectedId(book.id)}
              >
                <span className="now__pick-cover" style={{ background: book.coverColor ?? '#3a2a6e' }}>
                  <span className="now__pick-icon">
                    <FormatIcon format={f} size={10} strokeWidth={2.8} />
                  </span>
                </span>
                <span className="now__pick-text">
                  <span className="now__pick-title">{book.title}</span>
                  <span className="now__pick-meta">
                    {KICKER[f]} · {getBookProgress(book)}%
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Hero book={current} sessions={sessions} />

      <div className="now__actions">
        {timerElsewhere ? (
          <Button to={ROUTES.reading} icon={Play} className="now__cta">
            Voltar ao cronômetro
          </Button>
        ) : (
          <Link to={`${ROUTES.reading}?livro=${current.id}`} className="now__cta">
            <span className="now__cta-icon" aria-hidden="true">
              <Play size={16} fill="currentColor" />
            </span>
            {timerHere ? 'Voltar ao cronômetro' : format === 'audio' ? 'Continuar ouvindo' : 'Continuar lendo'}
          </Link>
        )}
        <Button to={ROUTES.book(current.id)} variant="secondary" className="now__second">
          Detalhes
        </Button>
        <Button variant="secondary" icon={PenLine} onClick={() => onManual(current.id)} className="now__second">
          Registrar sessão
        </Button>
      </div>
    </section>
  );
}

function Hero({ book, sessions }) {
  const format = normalizeFormat(book.format);
  const kind = getProgressKind(book);
  const progress = getBookProgress(book);
  const numbers = useMemo(() => getBookNumbers(book, sessions), [book, sessions]);
  const remaining = estimateRemainingSeconds(book, numbers);
  const measurable = hasMeasurableProgress(book);

  let pos;
  let of;
  if (kind === PROGRESS_KINDS.AUDIO) {
    pos = formatAudioPosition(book.audioPositionSeconds || 0, { withHours: book.audioDurationSeconds >= 3600 });
    of = book.audioDurationSeconds ? `de ${formatAudioPosition(book.audioDurationSeconds)}` : 'duração não informada';
  } else if (kind === PROGRESS_KINDS.PERCENT) {
    pos = `${progress}%`;
    of = 'do e-book';
  } else {
    pos = `p. ${formatNumber(book.currentPage)}`;
    of = book.totalPages ? `de ${formatNumber(book.totalPages)}` : 'total não informado';
  }
  const leftText = [describeRemaining(book), remaining ? `~${formatDuration(remaining)}` : ''].filter(Boolean).join(' · ');

  const stats = [
    { v: formatDuration(numbers.seconds), k: kind === PROGRESS_KINDS.AUDIO ? 'ouvidas' : 'lidas' },
    { v: formatNumber(numbers.sessions), k: numbers.sessions === 1 ? 'sessão' : 'sessões' },
  ];
  if (kind === PROGRESS_KINDS.PAGES && numbers.perUnit) stats.push({ v: `${formatDecimal(numbers.perUnit)} min`, k: 'por página' });
  if (kind === PROGRESS_KINDS.AUDIO && (book.audioSpeed || numbers.perUnit)) stats.push({ v: formatSpeed(book.audioSpeed ?? numbers.perUnit), k: 'velocidade' });
  if (numbers.lastSession) stats.push({ v: formatRelativeDay(numbers.lastSession.startedAt), k: 'última sessão' });

  return (
    <>
      <div className="now__hero">
        <div className="now__cover">
          <BookCover book={book} size="fluid" />
        </div>
        <div className="now__info">
          <span className="now__chip">
            <FormatIcon format={format} size={13} /> {format === 'digital' ? (book.progressMode === 'percent' ? 'E-book' : 'E-book · PDF') : KICKER[format]}
          </span>
          <h3 id="now-title" className="now__title">
            {book.title}
          </h3>
          <p className="now__author">
            {book.author}
            {book.narrator ? ` · narração de ${book.narrator}` : ''}
          </p>
          <ul className="now__stats">
            {stats.map((s) => (
              <li key={s.k}>
                <strong>{s.v}</strong> {s.k}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="now__progress">
        {measurable ? <FormatVisual format={format} ratio={progress / 100} /> : <div className="now__nobar">Informe o total no livro para ver o progresso.</div>}
        <div className="now__position tabular">
          <span>
            <strong>{pos}</strong> {of}
          </span>
          <span>{leftText || (measurable ? `${progress}%` : '')}</span>
        </div>
        <span className="visually-hidden">{`Progresso: ${progress}% (${FORMAT_LABELS[format]})`}</span>
      </div>
    </>
  );
}

/** Animação de cada formato (decorativa; o progresso também está em texto). */
export function FormatVisual({ format, ratio }) {
  const r = Math.min(1, Math.max(0, ratio));
  if (format === 'audio') {
    const n = 48;
    const played = Math.round(n * r);
    return (
      <div className="fv fv--audio" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => {
          const h = Math.min(100, 18 + Math.round(Math.abs(Math.sin(i * 1.7) * 60 + Math.cos(i * 0.6) * 22)));
          const on = i < played;
          const near = on && i >= played - 6;
          return (
            <span
              key={i}
              className={`fv__bar ${on ? 'is-on' : ''} ${near ? 'is-near' : ''}`}
              style={{ height: `${h}%`, animationDelay: `${-((i * 137) % 1000) / 1000}s` }}
            />
          );
        })}
      </div>
    );
  }
  if (format === 'digital') {
    const n = 20;
    const read = Math.min(n - 1, Math.round(n * r));
    return (
      <div className="fv fv--digital" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={`fv__sheet ${i < read ? 'is-read' : ''} ${i === read ? 'is-current' : ''}`}>
            <span className="fv__lines" />
            {i === read && <span className="fv__scan" />}
          </span>
        ))}
      </div>
    );
  }
  const n = 64;
  const read = Math.round(n * r);
  return (
    <div className="fv fv--print" aria-hidden="true">
      <div className="fv__pages">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={`fv__page ${i < read ? 'is-read' : ''} ${i < read && i >= read - 5 ? 'is-near' : ''}`} style={{ height: `${86 + ((i * 53) % 14)}%` }} />
        ))}
      </div>
      <div className="fv__book" style={{ left: `min(${r * 100}%, calc(100% - 34px))` }}>
        <span className="fv__leaf-back" />
        <span className="fv__leaf" />
      </div>
      <span className="fv__ribbon" style={{ left: `min(${r * 100}%, calc(100% - 34px))` }} />
    </div>
  );
}
