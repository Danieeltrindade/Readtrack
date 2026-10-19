import { useState } from 'react';
import './BookCover.css';

/**
 * Capa do livro. Usa a imagem de `coverUrl` quando existir; se não houver
 * ou se ela falhar ao carregar, gera uma capa tipográfica com a cor do livro.
 * Assim nenhuma capa protegida por direitos autorais vem embutida no projeto.
 *
 * `onImageError` permite ao formulário avisar que o endereço não carregou.
 */
export function BookCover({ book, size = 'md', className = '', onImageError }) {
  // Guardamos QUAL endereço falhou: se o usuário trocar a URL, tentamos de novo.
  const [failedUrl, setFailedUrl] = useState(null);
  const showImage = Boolean(book.coverUrl) && failedUrl !== book.coverUrl;

  return (
    <div
      className={`book-cover book-cover--${size} ${className}`}
      style={{ '--cover-color': book.coverColor || '#3a4560' }}
      role="img"
      aria-label={`Capa de ${book.title || 'livro sem título'}`}
    >
      {showImage ? (
        <img
          src={book.coverUrl}
          alt=""
          loading="lazy"
          onError={() => {
            setFailedUrl(book.coverUrl);
            onImageError?.(book.coverUrl);
          }}
        />
      ) : (
        <div className="book-cover__generated" aria-hidden="true">
          <span className="book-cover__title">{book.title}</span>
          {size !== 'xs' && <span className="book-cover__author">{book.author}</span>}
        </div>
      )}
    </div>
  );
}
