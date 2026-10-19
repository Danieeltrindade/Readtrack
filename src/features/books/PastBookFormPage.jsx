import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { PastBookForm } from './components/PastBookForm.jsx';
import './BookForm.css';

/** /livros/ja-lido — cadastro de um livro lido antes do ReadTrack. */
export default function PastBookFormPage() {
  useDocumentTitle('Adicionar livro já concluído');
  return <PastBookForm />;
}
