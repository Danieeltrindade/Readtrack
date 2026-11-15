import { BookOpen, Headphones, TabletSmartphone } from 'lucide-react';
import { FORMAT_LABELS, FORMAT_SHORT_LABELS, normalizeFormat } from '../../utils/formats.js';
import './FormatBadge.css';

const FORMAT_ICONS = { print: BookOpen, digital: TabletSmartphone, audio: Headphones };

/** Ícone do formato (físico, e-book/PDF, audiobook). */
export function FormatIcon({ format, size = 16, ...rest }) {
  const Icon = FORMAT_ICONS[normalizeFormat(format)];
  return <Icon size={size} aria-hidden="true" {...rest} />;
}

/** Selo do formato: ícone + nome curto, na cor do formato. */
export function FormatBadge({ format, long = false }) {
  const f = normalizeFormat(format);
  return (
    <span className={`format-badge format-badge--${f}`} title={FORMAT_LABELS[f]}>
      <FormatIcon format={f} size={13} />
      {long ? FORMAT_LABELS[f] : FORMAT_SHORT_LABELS[f]}
    </span>
  );
}
