/**
 * Caminhos das telas do app, RELATIVOS ao espaço em que aparecem
 * (/app na área pessoal, /demo na demonstração). Sem dependências, para
 * poder ser usado em qualquer lugar (inclusive nos testes do Node).
 */
export const ROUTES = Object.freeze({
  dashboard: '/',
  library: '/biblioteca',
  newBook: '/livros/novo',
  newPastBook: '/livros/ja-lido',
  importHistory: '/importar-historico',
  book: (id = ':bookId') => `/livros/${id}`,
  editBook: (id = ':bookId') => `/livros/${id}/editar`,
  reading: '/leitura',
  history: '/historico',
  statistics: '/estatisticas',
  goals: '/metas',
  settings: '/configuracoes',
});
